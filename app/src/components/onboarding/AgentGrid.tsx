import { AGENTS } from './constants';
import { Phase } from './types';
import { Check } from 'lucide-react';

interface AgentGridProps {
  phase: Phase;
  activatedAgents: Set<string>;
  activatingAgent: string | null;
}

export function AgentGrid({ phase, activatedAgents, activatingAgent }: AgentGridProps) {
  return (
    <div className={`w-[420px] flex-shrink-0 border-r border-white/5 flex flex-col px-9 py-11 relative z-10 transition-colors duration-[2000ms] ease-in-out ${phase === 'done'
        ? 'bg-gradient-to-br from-[#0F1A0E] to-[#090914]'
        : 'bg-gradient-to-br from-[#0E0B1A] to-[#090910]'
      }`}>
      {/* Logo */}
      <div className="font-syne text-[18px] font-extrabold tracking-[0.1em] text-[#FF6521] mb-11">
        TORQQ AI
      </div>

      {/* Section label */}
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/25 mb-[18px]">
        {phase === 'activate' ? 'Activating Team...' : phase === 'done' ? 'Team Operational' : 'Your AI Team'}
      </div>

      {/* Agent cards — 2 column grid */}
      <div className="grid grid-cols-2 gap-2.5 flex-1 content-start">
        {AGENTS.map((agent) => {
          const isActive = activatedAgents.has(agent.id);
          const isActivating = activatingAgent === agent.id;
          const dim = phase === 'welcome' || phase === 'form';

          return (
            <div
              key={agent.id}
              className={`rounded-xl p-3.5 transition-all duration-500 backdrop-blur-md ${dim ? 'opacity-35' : isActive ? 'opacity-100' : 'opacity-50'}`}
              style={{
                border: `1px solid ${isActive ? agent.color + '33' : 'rgba(255,255,255,0.05)'}`,
                background: isActive
                  ? `linear-gradient(135deg, ${agent.color}15 0%, rgba(0,0,0,0) 70%)`
                  : 'rgba(255,255,255,0.02)',
                boxShadow: isActive ? `0 0 20px ${agent.glow}` : 'none',
              }}
            >
              {/* Avatar + name row */}
              <div className="flex items-center gap-[9px] mb-2.5">
                <div className="relative shrink-0">
                  {/* Pulse ring on activating */}
                  {isActivating && (
                    <div
                      className="absolute -inset-[3px] rounded-full border border-dashed animate-[spin_4s_linear_infinite]"
                      style={{ borderColor: agent.color }}
                    />
                  )}
                  {/* Avatar orb */}
                  <div className="font-syne w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500"
                    style={{
                      background: isActive ? agent.color : 'rgba(255,255,255,0.07)',
                      color: isActive ? '#09090F' : 'rgba(255,255,255,0.25)',
                    }}>
                    {agent.name[0]}
                  </div>
                  {/* Online dot */}
                  {isActive && (
                    <div className="absolute -bottom-px -right-px w-[9px] h-[9px] rounded-full bg-[#4ADE80] border-2 border-[#09090F] shadow-[0_0_10px_rgba(74,222,128,0.5)] animate-pulse" />
                  )}
                </div>

                <div>
                  <div className="font-syne text-xs font-semibold leading-tight transition-colors duration-500"
                    style={{ color: isActive ? '#EDEDF3' : 'rgba(255,255,255,0.35)' }}>
                    {agent.name}
                  </div>
                  <div className="font-mono text-[9px] tracking-[0.04em] transition-colors duration-500"
                    style={{ color: isActive ? agent.color : 'rgba(255,255,255,0.18)' }}>
                    {agent.role}
                  </div>
                </div>
              </div>

              {/* Status line */}
              <div className="font-mono text-[9px] tracking-[0.04em] leading-[1.4] pt-[9px] border-t transition-all duration-500 whitespace-nowrap overflow-hidden text-ellipsis"
                style={{
                  borderTopColor: 'rgba(255,255,255,0.05)',
                  color: isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)'
                }}>
                {isActive ? (
                  <span className="text-[#4ADE80]">● {agent.task}</span>
                ) : isActivating ? (
                  <span className="animate-pulse" style={{ color: agent.color }}>
                    ◌ INITIALISING...
                  </span>
                ) : (
                  <span>○ STANDBY</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Done message */}
      {phase === 'done' && (
        <div className="font-mono mt-6 py-3.5 px-4 bg-[#4ADE80]/10 border border-[#4ADE80]/20 rounded-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-[#4ADE80] text-[11px] tracking-[0.06em] mb-1 flex items-center">
            <Check className="h-3 w-3 mr-1" /> TEAM OPERATIONAL
          </div>
          <div className="text-white/35 text-[10px]">
            First reports arrive midnight IST
          </div>
        </div>
      )}
    </div>
  );
}
