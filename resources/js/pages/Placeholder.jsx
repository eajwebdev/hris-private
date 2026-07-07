import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { Hammer } from 'lucide-react';

export default function Placeholder({ title, subtitle }) {
    return (
        <>
            <PageHeader title={title} subtitle={subtitle} />
            <Card>
                <EmptyState
                    icon={Hammer}
                    title="This module is being built"
                    message="It’s part of the EAJ HRIS build plan and will light up here once its phase ships."
                />
            </Card>
        </>
    );
}
