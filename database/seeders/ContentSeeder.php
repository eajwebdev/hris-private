<?php

namespace Database\Seeders;

use App\Models\Announcement;
use App\Models\AppNotification;
use App\Models\Event;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class ContentSeeder extends Seeder
{
    public function run($company, array $branches, $author): void
    {
        [$makati, $cebu] = $branches;

        // --- Events (mix of company-wide and branch) ----------------------------
        $events = [
            ['title' => 'Company Town Hall', 'days' => 2, 'hour' => 14, 'location' => 'Main Auditorium', 'branch' => null, 'color' => '#2f6f5e', 'rsvp' => true],
            ['title' => 'Payroll Cut-off', 'days' => 5, 'hour' => 17, 'location' => 'HR Office', 'branch' => null, 'color' => '#e0a458', 'rsvp' => false],
            ['title' => 'Makati Team Building', 'days' => 9, 'hour' => 8, 'location' => 'Tagaytay', 'branch' => $makati->id, 'color' => '#5b7cfa', 'rsvp' => true],
            ['title' => 'Cebu Branch Anniversary', 'days' => 12, 'hour' => 18, 'location' => 'IT Park', 'branch' => $cebu->id, 'color' => '#d0454c', 'rsvp' => true],
            ['title' => 'Security Awareness Webinar', 'days' => 15, 'hour' => 10, 'location' => 'Online (Zoom)', 'branch' => null, 'color' => '#2f8f6b', 'rsvp' => false],
            ['title' => 'Wellness Wednesday', 'days' => -3, 'hour' => 16, 'location' => 'Rooftop', 'branch' => null, 'color' => '#2f6f5e', 'rsvp' => false],
        ];
        foreach ($events as $e) {
            $start = Carbon::today()->addDays($e['days'])->setHour($e['hour']);
            Event::create([
                'company_id' => $company->id,
                'branch_id' => $e['branch'],
                'created_by' => $author->id,
                'title' => $e['title'],
                'description' => 'Auto-seeded event for demo purposes. All employees can view this in their dashboard.',
                'location' => $e['location'],
                'starts_at' => $start,
                'ends_at' => (clone $start)->addHours(3),
                'audience' => $e['branch'] ? 'branch' : 'all',
                'rsvp_enabled' => $e['rsvp'],
                'color' => $e['color'],
            ]);
        }

        // --- Announcements ------------------------------------------------------
        $announcements = [
            ['title' => 'Updated Leave Policy 2026', 'priority' => 'high', 'pinned' => true],
            ['title' => 'New Coffee Machine on 5th Floor', 'priority' => 'normal', 'pinned' => false],
            ['title' => 'Reminder: Update your 201 file', 'priority' => 'normal', 'pinned' => false],
        ];
        foreach ($announcements as $a) {
            Announcement::create([
                'company_id' => $company->id,
                'created_by' => $author->id,
                'title' => $a['title'],
                'body' => 'This is a seeded announcement so the dashboards have content to display.',
                'is_pinned' => $a['pinned'],
                'priority' => $a['priority'],
                'published_at' => now()->subDays(rand(0, 6)),
            ]);
        }

        // --- Notifications for every user (admin + employee side) ---------------
        $samples = [
            ['type' => 'event', 'title' => 'New event: Company Town Hall', 'body' => 'Happening in 2 days · Main Auditorium', 'link' => '/ess/events', 'icon' => 'calendar'],
            ['type' => 'announcement', 'title' => 'Updated Leave Policy 2026', 'body' => 'Please review the new leave policy.', 'link' => '/ess', 'icon' => 'megaphone'],
            ['type' => 'info', 'title' => 'Welcome to EAJ HRIS', 'body' => 'Your account is ready. Explore your self-service tools.', 'link' => '/ess', 'icon' => 'sparkles'],
        ];
        foreach (User::all() as $user) {
            foreach ($samples as $i => $s) {
                AppNotification::create(array_merge($s, [
                    'user_id' => $user->id,
                    'read_at' => $i === 2 ? now()->subDay() : null, // last one already read
                    'created_at' => now()->subHours($i * 5 + 1),
                ]));
            }
        }
    }
}
