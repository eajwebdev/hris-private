<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Auditor;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $q = User::with('branches:id,name,code', 'employee:id,user_id')
            ->where('company_id', $request->user()->company_id)
            ->when($request->filled('search'), function ($w) use ($request) {
                $s = $request->string('search');
                $w->where(fn ($x) => $x->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%")->orWhere('username', 'like', "%{$s}%"));
            })
            ->when($request->filled('preset'), fn ($w) => $w->where('preset', $request->string('preset')))
            ->when($request->filled('status'), fn ($w) => $w->where('is_active', $request->string('status') === 'active'))
            ->orderBy('name');

        $page = $q->paginate($request->integer('per_page', 15));
        $page->getCollection()->transform(fn ($u) => $this->shape($u));

        return $page;
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request));

        $user = new User([
            'name' => $data['name'],
            'username' => $data['username'] ?? null,
            'email' => $data['email'],
            'company_id' => $request->user()->company_id,
            'preset' => $data['preset'],
            'is_active' => $data['is_active'] ?? true,
            'is_super_admin' => $data['preset'] === 'super_admin',
        ]);
        $user->password = Hash::make($data['password'] ?? Str::password(12));
        $user->save();

        $user->branches()->sync($data['branch_ids'] ?? []);
        if (! empty($data['permissions'])) {
            $this->syncPermissions($user, $data['permissions']);
        }

        Auditor::record('users', 'created', "Created user {$user->name} ({$user->email}) with the {$user->preset} preset.", $user);

        return response()->json(['message' => 'User created.', 'user' => $this->shape($user->fresh()->load('branches', 'employee'))], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        abort_unless($user->company_id === $request->user()->company_id, 404);
        $data = $request->validate($this->rules($request, $user->id));

        // Stripping the owner bit is an owner-only act too — otherwise a delegated
        // `users.edit` holder could lock the system owner out of their own billing.
        if ($user->is_super_admin && ! $request->user()->isSuperAdmin()) {
            abort(403, 'Only the system owner can modify a SuperAdmin account.');
        }

        // Don't allow demoting the last super admin.
        if ($user->is_super_admin && $data['preset'] !== 'super_admin' && $this->superAdminCount($request) <= 1) {
            return response()->json(['message' => 'You can’t remove the last SuperAdmin.'], 422);
        }

        $before = Auditor::before($user);

        $user->fill([
            'name' => $data['name'],
            'username' => $data['username'] ?? null,
            'email' => $data['email'],
            'preset' => $data['preset'],
            'is_active' => $data['is_active'] ?? $user->is_active,
            'is_super_admin' => $data['preset'] === 'super_admin',
        ]);
        if (! empty($data['password'])) {
            $user->password = Hash::make($data['password']);
        }
        $user->save();
        $changes = Auditor::diff($user, $before);

        $user->branches()->sync($data['branch_ids'] ?? []);
        if (array_key_exists('permissions', $data)) {
            $this->syncPermissions($user, $data['permissions'] ?? []);
            // Permission edits are the whole point of the trail — record them even
            // though they live in a pivot table rather than on the user row.
            $changes['permissions'] = ['old' => null, 'new' => 'rewritten'];
        }

        Auditor::record('users', 'updated', "Updated user {$user->name} ({$user->email}).", $user, $changes);

        return response()->json(['message' => 'User updated.', 'user' => $this->shape($user->fresh()->load('branches', 'employee'))]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_unless($user->company_id === $request->user()->company_id, 404);
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You can’t deactivate your own account.'], 422);
        }
        if ($user->is_super_admin && ! $request->user()->isSuperAdmin()) {
            abort(403, 'Only the system owner can remove a SuperAdmin account.');
        }
        if ($user->is_super_admin && $this->superAdminCount($request) <= 1) {
            return response()->json(['message' => 'You can’t remove the last SuperAdmin.'], 422);
        }

        Auditor::record('users', 'deleted', "Deactivated user {$user->name} ({$user->email}).", $user);

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'User deactivated.']);
    }

    /** Issue a fresh temporary password. */
    public function resetPassword(Request $request, User $user): JsonResponse
    {
        abort_unless($user->company_id === $request->user()->company_id, 404);

        // Handing out a temp password for the owner's account IS taking over the owner's
        // account. Owner-only, same as every other write against a SuperAdmin row.
        if ($user->is_super_admin && ! $request->user()->isSuperAdmin()) {
            abort(403, 'Only the system owner can reset a SuperAdmin password.');
        }

        $temp = Str::password(12);
        $user->update(['password' => Hash::make($temp)]);
        $user->tokens()->delete(); // force re-login everywhere

        Auditor::record('users', 'updated', "Reset the password for {$user->name} ({$user->email}).", $user);

        return response()->json(['message' => "Password reset for {$user->email}.", 'temp_password' => $temp]);
    }

    // ------------------------------------------------------------ helpers

    private function rules(Request $request, ?int $ignoreId = null): array
    {
        $actor = $request->user();

        // SuperAdmin is the SYSTEM OWNER — it controls subscription billing and bypasses
        // every branch scope. Only an existing owner may hand that out. `users.edit` can
        // legitimately be delegated to an HR user via a per-user override, and without
        // this that user could simply PUT preset=super_admin on their own account and
        // promote themselves to owner.
        $presets = array_keys(config('hris.presets'));
        if (! $actor->isSuperAdmin()) {
            $presets = array_values(array_diff($presets, ['super_admin']));
        }

        // Branch ids must belong to the actor's OWN company. `exists:branches,id` alone
        // accepted any branch id in the table, so a tenant admin could attach a user
        // (themselves included) to another tenant's branch — and BranchScope would then
        // happily serve that tenant's employees, attendance and payroll.
        $branchRule = Rule::exists('branches', 'id')
            ->where(fn ($q) => $q->where('company_id', $actor->company_id)->whereNull('deleted_at'));

        return [
            'name' => ['required', 'string', 'max:120'],
            'username' => ['nullable', 'string', 'max:60', 'alpha_dash', Rule::unique('users', 'username')->ignore($ignoreId)],
            'email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($ignoreId)],
            'password' => ['nullable', 'string', 'min:8', 'max:100'],
            'preset' => ['required', Rule::in($presets)],
            'is_active' => ['boolean'],
            'branch_ids' => ['array'],
            'branch_ids.*' => ['integer', $branchRule],
            'permissions' => ['sometimes', 'array'],
        ];
    }

    private function superAdminCount(Request $request): int
    {
        return User::where('company_id', $request->user()->company_id)->where('is_super_admin', true)->count();
    }

    /** Store only the cells that DIFFER from the preset baseline. */
    private function syncPermissions(User $user, array $matrix): void
    {
        $modules = config('hris.modules');
        $presetModules = config('hris.presets.' . $user->preset . '.modules', []);

        $user->modulePermissions()->delete();
        if ($user->is_super_admin) {
            return; // super admin bypasses; overrides are meaningless
        }

        foreach ($modules as $key => $def) {
            if (! isset($matrix[$key])) {
                continue;
            }
            $grant = $presetModules[$key] ?? [];
            $granted = $grant === '*' ? $def['abilities'] : (array) $grant;

            $overrides = [];
            foreach ($def['abilities'] as $ability) {
                $want = (bool) ($matrix[$key][$ability] ?? false);
                $base = in_array($ability, $granted, true);
                if ($want !== $base) {
                    $overrides[$ability] = $want;
                }
            }
            if ($overrides) {
                $user->modulePermissions()->create(['module' => $key, 'abilities' => $overrides]);
            }
        }
    }

    private function shape(User $u): array
    {
        return [
            'id' => $u->id,
            'name' => $u->name,
            'username' => $u->username,
            'email' => $u->email,
            'preset' => $u->preset,
            'is_super_admin' => (bool) $u->is_super_admin,
            'is_active' => (bool) $u->is_active,
            'avatar_url' => $u->avatar_path ? asset('storage/' . $u->avatar_path) : null,
            'has_employee' => $u->relationLoaded('employee') ? (bool) $u->employee : false,
            'branches' => $u->branches->map(fn ($b) => ['id' => $b->id, 'name' => $b->name, 'code' => $b->code])->values(),
            'branch_ids' => $u->branches->pluck('id'),
            'permissions' => Permissions::effective($u),
        ];
    }
}
