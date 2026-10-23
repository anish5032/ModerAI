import { motion } from 'framer-motion';
import { riskHex, riskLevelLabel, scoreToLevel } from '../utils/moderation';
const ARC_LENGTH = Math.PI * 100;
export function CompositeGauge({ score }) {
    const clamped = Math.min(Math.max(score, 0), 1);
    const level = scoreToLevel(clamped);
    const color = riskHex[level];
    return (<div className="flex flex-col items-center">
      <svg viewBox="0 0 240 134" className="w-full max-w-[250px]" role="img" aria-label={`Composite risk score ${clamped.toFixed(2)} â€” ${riskLevelLabel[level]}`}>

        <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="#E2E8F0" strokeWidth="14" strokeLinecap="round"/>

        <motion.path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={ARC_LENGTH} animate={{ strokeDashoffset: ARC_LENGTH * (1 - clamped) }} initial={false} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}/>

        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const angle = Math.PI * (1 - tick);
            return (<line key={tick} x1={120 + Math.cos(angle) * 84} y1={120 - Math.sin(angle) * 84} x2={120 + Math.cos(angle) * 76} y2={120 - Math.sin(angle) * 76} stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round"/>);
        })}
        <text x="120" y="104" textAnchor="middle" className="fill-ink font-mono" style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em' }}>

          {clamped.toFixed(2)}
        </text>
        <text x="16" y="133" className="fill-[#94A3B8] font-mono" style={{ fontSize: 10 }}>
          0.0
        </text>
        <text x="224" y="133" textAnchor="end" className="fill-[#94A3B8] font-mono" style={{ fontSize: 10 }}>

          1.0
        </text>
      </svg>

      <span className="-mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ color, backgroundColor: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}40` }}>

        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }}/>
        {riskLevelLabel[level]}
      </span>
    </div>);
}
