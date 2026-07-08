export function PageHeader({ title, subtitle, actions }) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
            <div className="border-l-[3px] border-brand pl-3">
                <h1 className="text-2xl font-semibold font-display tracking-tight">{title}</h1>
                {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
