import { ChevronDownIcon, RadioIcon, ShieldCheckIcon, UploadCloudIcon, VideoIcon } from 'lucide-react';
import { useCurrentModerator } from '../lib/auth';
const modes = [
    { key: 'simulation', label: 'Live Stream Simulation', icon: RadioIcon },
    { key: 'upload', label: 'Upload Custom Video', icon: VideoIcon }
];
export function TopBar({ mode, processing, fileName, onModeChange, onRequestUpload }) {
    const moderator = useCurrentModerator();
    return (<header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-card">
            <ShieldCheckIcon className="h-5 w-5" aria-hidden="true"/>
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink">ModeraAI</h1>
            <p className="truncate text-xs text-ink-muted">Multimodal Video Moderation Pipeline</p>
          </div>
        </div>

        <div className="order-last flex w-full items-center gap-3 lg:order-none lg:mx-auto lg:w-auto">
          <div className="flex items-center gap-1 rounded-full border border-line bg-panel p-1" role="tablist" aria-label="Stage source">
            
            {modes.map((item) => {
            const Icon = item.icon;
            const active = mode === item.key;
            return (<button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => onModeChange(item.key)} className={[
                    'inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm',
                    active ?
                        'bg-surface text-ink shadow-card' :
                        'text-ink-muted hover:text-ink'
                ].
                    join(' ')}>
                  
                  <Icon className="h-4 w-4" aria-hidden="true"/>
                  {item.label}
                </button>);
        })}
          </div>

          {processing &&
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent ring-1 ring-inset ring-accent/25">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"/>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent"/>
              </span>
              Processing chunks
            </span>}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={onRequestUpload} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white shadow-card transition-colors duration-150 ease-out hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            
            <UploadCloudIcon className="h-4 w-4" aria-hidden="true"/>
            Upload Video
          </button>

          <div className="hidden h-8 w-px bg-line sm:block" aria-hidden="true"/>

          <button type="button" className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors duration-150 ease-out hover:bg-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
              {moderator.initials}
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-xs font-semibold text-ink">{moderator.name}</span>
              <span className="block text-[11px] text-ink-faint">{moderator.role}</span>
            </span>
            <ChevronDownIcon className="h-4 w-4 text-ink-faint" aria-hidden="true"/>
          </button>
        </div>

        {fileName && mode === 'upload' &&
            <p className="w-full truncate text-[11px] text-ink-faint lg:w-auto lg:basis-full">
            Source file: <span className="font-mono text-ink-muted">{fileName}</span>
          </p>}
      </div>
    </header>);
}
