import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

interface Pulse {
  x: number;
  v: number;
  len: number;
}

interface Strand {
  y: number;
  amp: number;
  freq: number;
  phase: number;
  drift: number;
  tilt: number;
  color: string;
  width: number;
  pulses: Pulse[];
}

interface Node {
  x: number;
  y: number;
  r: number;
  ph: number;
  sp: number;
  color: string;
}

const COLORS = ['#7c3aed', '#06b6d4', '#a78bfa', '#22d3ee', '#818cf8'];

/**
 * Fondo decorativo del login: hilos de fibra con pulsos de luz y nodos de red.
 * Es puro adorno, sin dependencias externas, y se detiene al salir de la vista.
 */
@Component({
  selector: 'app-fiber-canvas',
  template: `<canvas #canvas class="fiber-bg" aria-hidden="true"></canvas>`,
})
export class FiberCanvasComponent implements AfterViewInit {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private strands: Strand[] = [];
  private nodes: Node[] = [];
  private time = 0;
  private lastFrame = 0;
  private rafId: number | null = null;
  private observer: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) {
      return;
    }

    this.resize();

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!reduce) {
      this.rafId = requestAnimationFrame((t) => {
        this.lastFrame = t;
        this.loop(t);
      });
    }

    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
      }
    });
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.lastFrame) / 1000 || 0, 0.05);
    this.lastFrame = now;
    if (this.width && this.height) {
      this.time += dt;
      this.draw(dt);
    }
  };

  private resize(): void {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !this.ctx) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.build();
    this.draw(0);
  }

  private build(): void {
    const strandCount = this.width < 700 ? 10 : 18;
    this.strands = Array.from({ length: strandCount }, (_, i) => {
      const pulseCount = 1 + (Math.random() < 0.8 ? 1 : 0);
      return {
        y: ((i + 0.5) / strandCount) * this.height * 1.14 - this.height * 0.07,
        amp: rand(14, 52),
        freq: (rand(0.9, 2.3) * Math.PI * 2) / Math.max(this.width, 1),
        phase: rand(0, Math.PI * 2),
        drift: rand(0.1, 0.3),
        tilt: rand(-0.22, 0.22) * this.height,
        color: COLORS[i % COLORS.length],
        width: rand(0.6, 1.5),
        pulses: Array.from({ length: pulseCount }, () => ({
          x: rand(-300, this.width),
          v: rand(85, 210),
          len: rand(80, 190),
        })),
      };
    });

    const nodeCount = this.width < 700 ? 4 : 8;
    this.nodes = Array.from({ length: nodeCount }, (_, j) => ({
      x: rand(0.08, 0.98) * this.width,
      y: rand(0.05, 0.95) * this.height,
      r: rand(1.4, 2.6),
      ph: rand(0, Math.PI * 2),
      sp: rand(0.5, 1.1),
      color: COLORS[j % COLORS.length],
    }));
  }

  private yAt(s: Strand, x: number): number {
    return (
      s.y +
      s.tilt * (x / Math.max(this.width, 1)) +
      Math.sin(x * s.freq + s.phase + this.time * s.drift) * s.amp
    );
  }

  private draw(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineCap = 'round';

    for (const s of this.strands) {
      // hilo tenue de extremo a extremo
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      for (let x = -20; x <= this.width + 20; x += 16) {
        const y = this.yAt(s, x);
        if (x === -20) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // pulsos de luz viajando por el hilo
      for (const pulse of s.pulses) {
        pulse.x += pulse.v * dt;
        if (pulse.x - pulse.len > this.width + 40) {
          pulse.x = rand(-420, -120);
          pulse.v = rand(85, 210);
          pulse.len = rand(80, 190);
        }

        const step = 9;
        for (let d = 0; d < pulse.len; d += step) {
          const xa = pulse.x - d;
          const xb = xa - step;
          if (xa < -30 || xb > this.width + 30) {
            continue;
          }
          const k = 1 - d / pulse.len;
          ctx.globalAlpha = k * k;
          ctx.lineWidth = s.width + k * 2.4;
          ctx.strokeStyle = s.color;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = k * 10;
          ctx.beginPath();
          ctx.moveTo(xa, this.yAt(s, xa));
          ctx.lineTo(xb, this.yAt(s, xb));
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // cabeza brillante
        if (pulse.x > -20 && pulse.x < this.width + 20) {
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(pulse.x, this.yAt(s, pulse.x), s.width + 1.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    // nodos de red con anillo expansivo
    for (const nd of this.nodes) {
      const phase = (this.time * nd.sp + nd.ph) % (Math.PI * 2);
      const grow = phase / (Math.PI * 2);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = nd.color;
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = (1 - grow) * 0.4;
      ctx.strokeStyle = nd.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, nd.r + grow * 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
