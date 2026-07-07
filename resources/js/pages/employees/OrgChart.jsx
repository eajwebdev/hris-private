import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Network } from 'lucide-react';
import api from '@/lib/api';
import { useBranches } from '@/hooks/useLookups';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingBlock, EmptyState } from '@/components/ui/States';

function buildTree(list) {
    const byId = new Map(list.map((n) => [n.id, { ...n, children: [] }]));
    const roots = [];
    byId.forEach((node) => {
        if (node.manager_id && byId.has(node.manager_id)) byId.get(node.manager_id).children.push(node);
        else roots.push(node);
    });
    return roots;
}

function Node({ node, onOpen }) {
    return (
        <li className="flex flex-col items-center">
            <button onClick={() => onOpen(node.id)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-3 w-40 hover:border-brand transition-colors">
                <Avatar name={node.name} src={node.photo_url} />
                <div className="text-center">
                    <p className="text-sm font-medium leading-tight">{node.name}</p>
                    <p className="text-xs text-muted">{node.position ?? '—'}</p>
                </div>
            </button>
            {node.children.length > 0 && (
                <ul className="mt-4 flex gap-4 relative pt-4 before:absolute before:top-0 before:left-1/2 before:h-4 before:w-px before:bg-border">
                    {node.children.map((c) => <Node key={c.id} node={c} onOpen={onOpen} />)}
                </ul>
            )}
        </li>
    );
}

export default function OrgChart() {
    const navigate = useNavigate();
    const { data: branches } = useBranches();
    const [branchId, setBranchId] = useState('');

    const effBranch = branchId || branches?.[0]?.id;
    const { data, isLoading } = useQuery({
        queryKey: ['org-chart', effBranch],
        queryFn: async () => (await api.get('/employees/org-chart', { params: { branch_id: effBranch } })).data,
        enabled: !!effBranch,
    });

    const roots = useMemo(() => buildTree(data ?? []), [data]);

    return (
        <>
            <button onClick={() => navigate('/app/employees')} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to employees
            </button>
            <PageHeader
                title="Org chart"
                subtitle="Reporting lines per branch."
                actions={
                    <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-52">
                        {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                }
            />
            <Card>
                <CardBody>
                    {isLoading ? (
                        <LoadingBlock />
                    ) : roots.length === 0 ? (
                        <EmptyState icon={Network} title="No reporting lines yet" message="Set an employee’s “Reports to” to build the tree." />
                    ) : (
                        <div className="overflow-x-auto pb-4">
                            <ul className="flex gap-8 justify-center min-w-max px-4">
                                {roots.map((r) => <Node key={r.id} node={r} onOpen={(id) => navigate(`/app/employees/${id}`)} />)}
                            </ul>
                        </div>
                    )}
                </CardBody>
            </Card>
        </>
    );
}
