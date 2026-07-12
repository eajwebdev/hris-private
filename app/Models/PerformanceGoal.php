<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PerformanceGoal extends Model
{
    protected $fillable = [
        'performance_review_id', 'title', 'description', 'weight',
        'rating', 'comments', 'self_rating', 'self_comments', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'weight' => 'integer',
            'rating' => 'integer',
            'self_rating' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function review(): BelongsTo
    {
        return $this->belongsTo(PerformanceReview::class, 'performance_review_id');
    }
}
