'use client'
import { useEffect, useRef } from 'react'

interface Particle {
  x: number; y: number; vx: number; vy: number
  radius: number; opacity: number; type: 'circle' | 'cross' | 'pulse'
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Spawn medical particles
    const particles: Particle[] = Array.from({ length: 25 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 8 + 3,
      opacity: Math.random() * 0.3 + 0.05,
      type: (['circle', 'cross', 'pulse'] as const)[Math.floor(Math.random() * 3)],
    }))

    let frame = 0
    const drawCross = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
      const w = r * 0.35
      ctx.fillRect(x - w / 2, y - r, w, r * 2)
      ctx.fillRect(x - r, y - w / 2, r * 2, w)
    }

    const drawHeartbeatSegment = (
      ctx: CanvasRenderingContext2D, x: number, y: number, r: number
    ) => {
      ctx.beginPath()
      ctx.moveTo(x - r, y)
      ctx.lineTo(x - r * 0.5, y)
      ctx.lineTo(x - r * 0.25, y - r)
      ctx.lineTo(x, y + r * 0.5)
      ctx.lineTo(x + r * 0.25, y)
      ctx.lineTo(x + r, y)
      ctx.stroke()
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      frame++

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -50)            p.x = canvas.width + 50
        if (p.x > canvas.width + 50) p.x = -50
        if (p.y < -50)            p.y = canvas.height + 50
        if (p.y > canvas.height + 50) p.y = -50

        const pulse = 0.5 + 0.5 * Math.sin(frame * 0.02 + p.x)
        ctx.globalAlpha = p.opacity * (0.5 + pulse * 0.5)
        ctx.fillStyle = 'rgba(147,197,253,1)'
        ctx.strokeStyle = 'rgba(110,231,183,1)'
        ctx.lineWidth = 1.5

        if (p.type === 'circle') {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.type === 'cross') {
          ctx.save()
          ctx.translate(p.x, p.y)
          drawCross(ctx, 0, 0, p.radius)
          ctx.restore()
        } else {
          ctx.save()
          drawHeartbeatSegment(ctx, p.x, p.y, p.radius * 1.5)
          ctx.restore()
        }
      })

      ctx.globalAlpha = 1
      requestAnimationFrame(animate)
    }

    const raf = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: 'overlay' }}
    />
  )
}
