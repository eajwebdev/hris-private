import { useTheme } from '@/context/ThemeContext';

/** System brand mark — logo + name, driven by live settings. */
export function Brand({ subtitle }) {
    const { branding } = useTheme();
    return (
        <div className="flex items-center gap-2.5 px-6 py-5">
            <img
                src={branding.logo_url || '/logo2.png'}
                alt={branding.system_name}
                className="h-9 w-9 rounded-full object-contain ring-2 ring-white/10"
            />
            <div className="leading-tight">
                <p className="font-display font-semibold text-white truncate max-w-[150px]">{branding.system_name}</p>
                <p className="text-[11px] text-sidebar-text">{subtitle ?? branding.system_tagline}</p>
            </div>
        </div>
    );
}
