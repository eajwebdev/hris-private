<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Support\Collection;

/** Creates in-app notifications for users (admin + employee side). */
class Notifier
{
    public static function toUser(int $userId, array $data): void
    {
        AppNotification::create(array_merge([
            'user_id' => $userId,
            'type' => 'info',
        ], $data));
    }

    /** @param  iterable<int>  $userIds */
    public static function toUsers(iterable $userIds, array $data): void
    {
        $rows = [];
        $now = now();
        foreach ($userIds as $id) {
            $rows[] = array_merge([
                'user_id' => $id,
                'type' => 'info',
                'title' => '',
                'body' => null,
                'link' => null,
                'icon' => null,
                'read_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ], $data);
        }
        if ($rows) {
            AppNotification::insert($rows);
        }
    }

    /** Everyone in a company (optionally scoped to a branch). Excludes one user if given. */
    public static function toCompany(int $companyId, array $data, ?int $branchId = null, ?int $exceptUserId = null): void
    {
        $ids = self::audience($companyId, $branchId)
            ->reject(fn ($id) => $id === $exceptUserId)
            ->all();

        self::toUsers($ids, $data);
    }

    private static function audience(int $companyId, ?int $branchId): Collection
    {
        $q = User::query()->where('company_id', $companyId)->where('is_active', true);

        if ($branchId) {
            $q->whereHas('branches', fn ($b) => $b->where('branches.id', $branchId));
        }

        return $q->pluck('id');
    }
}
