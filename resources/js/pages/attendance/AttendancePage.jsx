import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import AttendanceMonitor from './AttendanceMonitor';
import AttendanceRecords from './AttendanceRecords';

export default function AttendancePage() {
    const [tab, setTab] = useState('monitor');

    return (
        <>
            {tab === 'records' && <PageHeader title="Attendance" subtitle="Daily records with late, undertime and early-out flags." />}
            <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
                {[['monitor', 'Who’s in'], ['records', 'Records']].map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={cn(
                            'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                            tab === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'monitor' ? <AttendanceMonitor /> : <AttendanceRecords />}
        </>
    );
}
