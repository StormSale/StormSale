import React, { useEffect, useRef } from "react";

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  shape: "rect" | "circle" | "star";
  opacity: number;
}

const CONFETTI_COLORS = [
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#fbbf24", // Gold
];

export interface ConfettiProps {
  active: boolean;
  duration?: number;
  onComplete?: () => void;
}

export const Confetti: React.FC<ConfettiProps> = ({ active, duration = 3500, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    // Generate ~150 celebratory particles
    const particleCount = 160;
    const particles: ConfettiParticle[] = [];

    for (let i = 0; i < particleCount; i++) {
      // Launch from both bottom left & right corners upwards towards center
      const fromLeft = i % 2 === 0;
      const startX = fromLeft
        ? width * 0.15 + (Math.random() - 0.5) * 80
        : width * 0.85 + (Math.random() - 0.5) * 80;
      const startY = height + 10;

      const angle = fromLeft
        ? -Math.PI / 3 + (Math.random() - 0.5) * 0.5
        : (-2 * Math.PI) / 3 + (Math.random() - 0.5) * 0.5;

      const speed = 14 + Math.random() * 12;

      particles.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 7 + Math.random() * 8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 12,
        shape: Math.random() > 0.4 ? "rect" : Math.random() > 0.5 ? "circle" : "star",
        opacity: 1,
      });
    }

    let animationFrameId: number;
    const startTime = performance.now();

    const drawStar = (
      context: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      spikes: number,
      outerRadius: number,
      innerRadius: number,
    ) => {
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;

      context.beginPath();
      context.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        context.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        context.lineTo(x, y);
        rot += step;
      }
      context.lineTo(cx, cy - outerRadius);
      context.closePath();
      context.fill();
    };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = elapsed / duration;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        // Physics update
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.38; // Gravity
        p.vx *= 0.985; // Air drag
        p.rotation += p.vRot;

        // Fade out near end of animation
        if (progress > 0.6) {
          p.opacity = Math.max(0, 1 - (progress - 0.6) / 0.4);
        }

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        } else if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          drawStar(ctx, 0, 0, 5, p.size * 0.7, p.size * 0.35);
        }

        ctx.restore();
      });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (onComplete) onComplete();
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [active, duration, onComplete]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      aria-hidden="true"
    />
  );
};
