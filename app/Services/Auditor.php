<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/**
 * Writes the append-only audit trail — "who changed what, when".
 *
 * Call it from the controller (not a model observer) so the entry can carry the
 * business meaning of the action: an approval and a rejection are both an
 * `update` to Eloquent, but they are very different things in the log.
 */
class Auditor
{
    /** Never write these to the trail, whatever model they arrive on. */
    private const REDACTED = ['password', 'remember_token', 'api_token', 'temp_password'];

    /** The verbs the UI knows how to colour. */
    public const ACTIONS = [
        'created', 'updated', 'deleted', 'approved', 'rejected',
        'submitted', 'acknowledged', 'granted', 'corrected', 'finalized', 'paid',
    ];

    public static function record(
        string $module,
        string $action,
        string $description,
        ?Model $subject = null,
        ?array $changes = null,
        ?int $branchId = null,
    ): void {
        $user = Auth::user();

        // No actor means no accountability to record (console, seeders, jobs).
        if (! $user) {
            return;
        }

        AuditLog::create([
            'company_id' => $user->company_id,
            'branch_id' => $branchId ?? ($subject->branch_id ?? null),
            'user_id' => $user->id,
            'user_name' => $user->name,
            'module' => $module,
            'action' => $action,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
            'subject_label' => $subject ? self::label($subject) : null,
            'description' => $description,
            'changes' => $changes ?: null,
            'ip' => Request::ip(),
            'user_agent' => substr((string) Request::userAgent(), 0, 255),
        ]);
    }

    /**
     * Snapshot a model's attributes *before* it is written.
     *
     * This is not optional bookkeeping: save() calls syncOriginal(), so once the
     * model has been saved its "original" attributes are the new ones and the old
     * values are gone for good. Capture this first, then hand it to diff().
     */
    public static function before(Model $model): array
    {
        return $model->getOriginal();
    }

    /**
     * Field-level diff of a model that has just been saved.
     *
     * `$before` must come from before() — see the note there about syncOriginal().
     *
     * @param  array<string, mixed>  $before
     * @return array<string, array{old: mixed, new: mixed}>
     */
    public static function diff(Model $model, array $before = []): array
    {
        $out = [];

        foreach ($model->getChanges() as $field => $new) {
            if (in_array($field, self::REDACTED, true) || in_array($field, ['updated_at', 'created_at'], true)) {
                continue;
            }

            $old = $before[$field] ?? null;

            // A cast can leave these as objects (dates, decimals); flatten for storage.
            $out[$field] = [
                'old' => self::scalar($old),
                'new' => self::scalar($new),
            ];
        }

        return $out;
    }

    /** A best-effort human name for the touched record. */
    private static function label(Model $subject): string
    {
        foreach (['full_name', 'name', 'title', 'label', 'number', 'period_label'] as $attribute) {
            $value = $subject->getAttribute($attribute);
            if (is_string($value) && $value !== '') {
                return substr($value, 0, 160);
            }
        }

        return class_basename($subject) . ' #' . $subject->getKey();
    }

    private static function scalar($value): string|int|float|bool|null
    {
        if ($value === null || is_scalar($value)) {
            return $value;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        return (string) (is_array($value) ? json_encode($value) : $value);
    }
}
