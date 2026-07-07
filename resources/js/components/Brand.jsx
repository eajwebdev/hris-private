import { useTheme } from '@/context/ThemeContext';

/** System brand mark — logo + name, driven by live settings. */
export function Brand({ subtitle }) {
    const { branding } = useTheme();
    return (
        <div className="flex items-center gap-2.5 px-6 py-5">
            {branding.logo_url ? (
                <img src={branding.logo_url} alt={branding.system_name} className="h-9 w-9 rounded-xl object-contain bg-white/5" />
            ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-ink font-display font-bold">
                    {branding.system_name?.[0] ?? 'E'}
                </div>
            )}
            <div className="leading-tight">
                <p className="font-display font-semibold text-white truncate max-w-[150px]">{branding.system_name}</p>
                <p className="text-[11px] text-sidebar-text">{subtitle ?? branding.system_tagline}</p>
            </div>
        </div>
    );
}
