<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Employee;
use App\Models\User;
use App\Models\UserModulePermission;
use App\Support\PrivateFile;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Locks in the security boundaries. Each test here maps to a hole that was live in
 * this codebase — they exist so a future refactor reopens one loudly rather than quietly.
 */
class SecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    private function owner(): User
    {
        return User::where('email', 'admin@eaj.test')->firstOrFail();
    }

    private function hrUser(): User
    {
        return User::where('email', 'hr@eaj.test')->firstOrFail();
    }

    private function employeeUser(): User
    {
        return User::where('email', 'employee@eaj.test')->firstOrFail();
    }

    /** An HR user who has been delegated full `users` rights via a per-user override. */
    private function delegatedUserAdmin(): User
    {
        $hr = $this->hrUser();

        UserModulePermission::updateOrCreate(
            ['user_id' => $hr->id, 'module' => 'users'],
            ['abilities' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true]],
        );

        return $hr->fresh();
    }

    // ------------------------------------------------- Private file delivery

    public function test_employee_documents_are_not_served_from_public_storage(): void
    {
        Storage::fake(PrivateFile::DISK);
        Storage::fake('public');

        Sanctum::actingAs($this->owner());
        $employee = Employee::withoutGlobalScopes()->firstOrFail();

        $response = $this->postJson("/api/v1/employees/{$employee->id}/documents", [
            'name' => 'Contract',
            'file' => UploadedFile::fake()->create('contract.pdf', 12, 'application/pdf'),
        ])->assertCreated();

        // The bytes land on the private disk and nowhere near public/storage.
        $this->assertCount(1, Storage::disk(PrivateFile::DISK)->allFiles());
        $this->assertEmpty(Storage::disk('public')->allFiles());

        // What the API hands back is a signed, expiring link — not a bare /storage path.
        $url = $response->json('url');
        $this->assertStringNotContainsString('/storage/', $url);
        $this->assertStringContainsString('signature=', $url);
    }

    public function test_a_private_file_cannot_be_fetched_without_a_valid_signature(): void
    {
        Storage::fake(PrivateFile::DISK);
        Storage::disk(PrivateFile::DISK)->put('employees/1/1/docs/secret.pdf', 'payroll secrets');

        $signed = PrivateFile::url('employees/1/1/docs/secret.pdf');

        // The genuine signed link works...
        $this->get($signed)->assertOk();

        // ...but the same path without a signature, or with a tampered one, does not.
        $this->get('/api/v1/files/employees/1/1/docs/secret.pdf')->assertForbidden();
        $this->get($signed . 'x')->assertForbidden();
    }

    public function test_an_expired_signature_is_rejected(): void
    {
        Storage::fake(PrivateFile::DISK);
        Storage::disk(PrivateFile::DISK)->put('leave/1/1/medcert.pdf', 'medical certificate');

        $signed = PrivateFile::url('leave/1/1/medcert.pdf');

        $this->travel(21)->minutes(); // TTL is 20
        $this->get($signed)->assertForbidden();
    }

    public function test_an_executable_file_cannot_be_uploaded_as_an_employee_document(): void
    {
        Storage::fake(PrivateFile::DISK);
        Sanctum::actingAs($this->owner());
        $employee = Employee::withoutGlobalScopes()->firstOrFail();

        foreach (['shell.php', 'payload.html', 'payload.svg'] as $filename) {
            $this->postJson("/api/v1/employees/{$employee->id}/documents", [
                'name' => 'Nasty',
                'file' => UploadedFile::fake()->create($filename, 4),
            ])->assertStatus(422)->assertJsonValidationErrors('file');
        }

        $this->assertEmpty(Storage::disk(PrivateFile::DISK)->allFiles());
    }

    // ------------------------------------------------- Privilege escalation

    public function test_a_delegated_user_admin_cannot_mint_a_super_admin(): void
    {
        Sanctum::actingAs($this->delegatedUserAdmin());

        $this->postJson('/api/v1/users', [
            'name' => 'Backdoor',
            'email' => 'backdoor@eaj.test',
            'password' => 'password123',
            'preset' => 'super_admin',
        ])->assertStatus(422)->assertJsonValidationErrors('preset');

        $this->assertDatabaseMissing('users', ['email' => 'backdoor@eaj.test']);
    }

    public function test_a_delegated_user_admin_cannot_promote_themselves_to_owner(): void
    {
        $hr = $this->delegatedUserAdmin();
        Sanctum::actingAs($hr);

        $this->putJson("/api/v1/users/{$hr->id}", [
            'name' => $hr->name,
            'email' => $hr->email,
            'preset' => 'super_admin',
        ])->assertStatus(422)->assertJsonValidationErrors('preset');

        $this->assertFalse($hr->fresh()->is_super_admin);
    }

    public function test_a_delegated_user_admin_cannot_take_over_the_owner_account(): void
    {
        $owner = $this->owner();
        Sanctum::actingAs($this->delegatedUserAdmin());

        // Resetting the owner's password IS taking over the owner's account.
        $this->postJson("/api/v1/users/{$owner->id}/reset-password")->assertForbidden();
        $this->deleteJson("/api/v1/users/{$owner->id}")->assertForbidden();

        $this->putJson("/api/v1/users/{$owner->id}", [
            'name' => $owner->name,
            'email' => $owner->email,
            'preset' => 'hr_admin',
        ])->assertForbidden();

        $this->assertTrue($owner->fresh()->is_super_admin);
    }

    // ------------------------------------------------- Cross-tenant isolation

    public function test_a_user_cannot_be_attached_to_another_companys_branch(): void
    {
        // A second tenant, with a branch that belongs strictly to them.
        $rival = Company::create(['name' => 'Rival Corp', 'slug' => 'rival-corp']);
        $rivalBranch = Branch::create(['company_id' => $rival->id, 'name' => 'Rival HQ', 'code' => 'RIV']);

        Sanctum::actingAs($this->delegatedUserAdmin());

        // Attaching this branch would put the rival's employees, attendance and payroll
        // inside our BranchScope.
        $this->postJson('/api/v1/users', [
            'name' => 'Spy',
            'email' => 'spy@eaj.test',
            'password' => 'password123',
            'preset' => 'hr_admin',
            'branch_ids' => [$rivalBranch->id],
        ])->assertStatus(422)->assertJsonValidationErrors('branch_ids.0');

        $this->assertDatabaseMissing('users', ['email' => 'spy@eaj.test']);
    }

    // ------------------------------------------------- Session auth

    /**
     * Sanctum only makes a request stateful when it carries an Origin/Referer from a
     * configured domain — which every real browser sends and the test client does not.
     * Without this the session middleware never runs and login 500s on a missing store.
     */
    private function browser(): self
    {
        return $this->withHeader('Origin', config('app.url'));
    }

    public function test_login_establishes_a_session_and_hands_back_no_token(): void
    {
        $response = $this->browser()->postJson('/api/v1/login', [
            'login' => 'employee@eaj.test',
            'password' => 'password',
        ])->assertOk();

        // A token in the body would end up in localStorage, readable by any injected
        // script and valid forever. The credential must be the httpOnly cookie only.
        $this->assertArrayNotHasKey('token', $response->json());
        $this->assertAuthenticatedAs($this->employeeUser(), 'web');

        // The session alone is enough to reach a protected endpoint.
        $this->browser()->getJson('/api/v1/me')->assertOk();
    }

    public function test_logout_destroys_the_session(): void
    {
        $this->browser()->postJson('/api/v1/login', [
            'login' => 'employee@eaj.test',
            'password' => 'password',
        ])->assertOk();

        $this->browser()->postJson('/api/v1/logout')->assertOk();

        $this->assertGuest('web');

        // Sanctum's RequestGuard memoises the user it resolved during the logout request,
        // and the test client reuses one container across requests where a real server
        // builds a fresh one per request. Drop the memoised guards so the next call has to
        // re-authenticate from scratch — i.e. what a browser would actually hit.
        $this->app['auth']->forgetGuards();

        $this->browser()->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_a_deactivated_user_cannot_sign_in(): void
    {
        $this->employeeUser()->update(['is_active' => false]);

        $this->browser()->postJson('/api/v1/login', [
            'login' => 'employee@eaj.test',
            'password' => 'password',
        ])->assertStatus(422);

        $this->assertGuest('web');
    }

    // ------------------------------------------------- Rate limiting

    public function test_the_public_careers_upload_is_rate_limited(): void
    {
        // Unauthenticated + writes rows + accepts files: the cheapest thing to abuse.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/careers/does-not-exist/apply', [])->assertNotFound();
        }

        $this->postJson('/api/v1/careers/does-not-exist/apply', [])->assertStatus(429);
    }

    public function test_ess_endpoints_still_work_for_a_plain_employee(): void
    {
        // The guards above must not have cost an ordinary employee their own data.
        Sanctum::actingAs($this->employeeUser());

        $this->getJson('/api/v1/profile')->assertOk();
        $this->getJson('/api/v1/leave/my')->assertOk();
        $this->getJson('/api/v1/payroll/my')->assertOk();
    }
}
