import { useEffect, useState } from "react";
import "./Celebrate.css";

const LEVELS = {
  25: {
    title: "25% 달성!",
    emoji: "🌱",
    sub: "첫 걸음을 내딛었어요!\n따뜻한 시작입니다.",
    colors: ["#22c55e", "#4ade80", "#86efac"],
    particleCount: 25,
    bgGlow: "rgba(34, 197, 94, 0.08)",
  },
  50: {
    title: "50% 달성!",
    emoji: "🔥",
    sub: "절반을 넘었어요!\n뜨거운 응원이 이어지고 있습니다.",
    colors: ["#f59e0b", "#fbbf24", "#fcd34d", "#22c55e"],
    particleCount: 45,
    bgGlow: "rgba(245, 158, 11, 0.1)",
  },
  75: {
    title: "75% 달성!",
    emoji: "⭐",
    sub: "거의 다 왔어요!\n목표가 눈앞에 있습니다!",
    colors: ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ec4899"],
    particleCount: 60,
    bgGlow: "rgba(139, 92, 246, 0.1)",
  },
  100: {
    title: "목표 달성!",
    emoji: "👑",
    sub: "캠페인 목표 금액을 달성했습니다!\n모든 기부자 여러분 감사합니다 💚",
    colors: ["#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#f97316"],
    particleCount: 80,
    bgGlow: "rgba(245, 158, 11, 0.12)",
  },
};

export default function Celebrate({ milestone, onClose }) {
  const [particles, setParticles] = useState([]);
  const level = LEVELS[milestone] || LEVELS[100];

  useEffect(() => {
    const pList = [];
    for (let i = 0; i < level.particleCount; i++) {
      pList.push({
        id: i,
        x: 50 + (Math.random() - 0.5) * 70,
        y: 40 + (Math.random() - 0.5) * 50,
        color: level.colors[Math.floor(Math.random() * level.colors.length)],
        size: 4 + Math.random() * (milestone >= 75 ? 10 : 7),
        delay: Math.random() * 0.6,
        duration: 1.2 + Math.random() * 1.5,
        shape: Math.random() > 0.4 ? "circle" : "rect",
        angle: Math.random() * 360,
      });
    }
    setParticles(pList);
    const timer = setTimeout(() => { if (onClose) onClose(); }, milestone >= 100 ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`celebrate-overlay level-${milestone}`} onClick={onClose}
      style={{ background: `radial-gradient(ellipse at center, ${level.bgGlow}, rgba(0,0,0,0.85))` }}>
      {particles.map((p) => (
        <div key={p.id} className={`confetti ${p.shape}`} style={{
          left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.color,
          width: `${p.size}px`, height: p.shape === "rect" ? `${p.size * 0.4}px` : `${p.size}px`,
          animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
          transform: `rotate(${p.angle}deg)`,
        }} />
      ))}
      {milestone >= 100 && (
        <div className="firework-ring">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="ring-particle" style={{
              transform: `rotate(${i * 30}deg) translateY(-100px)`,
              animationDelay: `${0.5 + i * 0.08}s`,
              backgroundColor: level.colors[i % level.colors.length],
            }} />
          ))}
        </div>
      )}
      <div className="celebrate-content">
        <div className={`celebrate-crown level-${milestone}`}>{level.emoji}</div>
        <h2 className={`celebrate-title level-${milestone}`}>🎉 {level.title} 🎉</h2>
        <p className="celebrate-sub">{level.sub.split("\n").map((line, i) => (<span key={i}>{line}<br /></span>))}</p>
        {milestone >= 75 && (
          <div className="celebrate-fireworks"><span>🎆</span><span>🎇</span><span>🎆</span></div>
        )}
        <div className="celebrate-progress">
          <div className="celebrate-progress-bar">
            <div className="celebrate-progress-fill" style={{ width: `${milestone}%` }} />
          </div>
          <span>{milestone}%</span>
        </div>
        <button className="celebrate-close" onClick={onClose}>확인</button>
      </div>
    </div>
  );
}
