import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CommsApi } from '../../core/api';
import { AiAgent } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';

interface ChatTurn {
  from: 'me' | 'agent';
  text: string;
}

/** Agentes de IA y consola de prueba. dd_ms_comms. */
@Component({
  selector: 'app-ai',
  imports: [
    ReactiveFormsModule,
    PageHeadComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './ai.component.html',
})
export class AiComponent {
  private readonly api = inject(CommsApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly agents = collection(() => this.api.agents(), [] as AiAgent[]);

  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly chattingWith = signal<AiAgent | null>(null);
  protected readonly turns = signal<ChatTurn[]>([]);
  protected readonly thinking = signal(false);

  /**
   * Identificador de la sesion de chat. El microservicio guarda el historial
   * por sessionId, asi que uno nuevo por cada apertura = conversacion limpia.
   */
  private sessionId = newSessionId();

  protected readonly channels = [
    { value: 'WHATSAPP', text: 'WhatsApp' },
    { value: 'WEB', text: 'Web / chat del sitio' },
    { value: 'INTERNAL', text: 'Interno (equipo)' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    channel: ['WHATSAPP', Validators.required],
    systemPrompt: ['', Validators.required],
    tools: [''],
  });

  protected readonly chatForm = this.fb.nonNullable.group({
    message: ['', Validators.required],
  });

  protected readonly stats = computed(() => {
    const all = this.agents.value();
    return {
      total: all.length,
      enabled: all.filter((a) => a.enabled).length,
      channels: new Set(all.map((a) => a.channel)).size,
    };
  });

  protected toolList(agent: AiAgent): string[] {
    return (agent.tools ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  protected channelText(channel: string): string {
    return this.channels.find((c) => c.value === channel)?.text ?? channel;
  }

  protected openCreate(): void {
    this.form.reset({ name: '', channel: 'WHATSAPP', systemPrompt: '', tools: '' });
    this.creating.set(true);
  }

  protected openChat(agent: AiAgent): void {
    this.sessionId = newSessionId();
    this.turns.set([]);
    this.chatForm.reset({ message: '' });
    this.chattingWith.set(agent);
  }

  protected closeModals(): void {
    this.creating.set(false);
    this.chattingWith.set(null);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .createAgent({
        name: raw.name,
        channel: raw.channel,
        systemPrompt: raw.systemPrompt,
        tools: raw.tools || null,
      })
      .subscribe({
        next: (agent) => {
          this.saving.set(false);
          this.creating.set(false);
          this.toast.success(`Agente "${agent.name}" creado.`);
          this.agents.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected sendMessage(): void {
    const agent = this.chattingWith();
    if (!agent || this.chatForm.invalid || this.thinking()) {
      return;
    }
    const message = this.chatForm.getRawValue().message.trim();
    if (!message) {
      return;
    }

    this.turns.update((list) => [...list, { from: 'me', text: message }]);
    this.chatForm.reset({ message: '' });
    this.thinking.set(true);

    this.api.chat(agent.id, { sessionId: this.sessionId, message }).subscribe({
      next: (res) => {
        this.thinking.set(false);
        this.turns.update((list) => [...list, { from: 'agent', text: res.reply }]);
      },
      error: (err: unknown) => {
        this.thinking.set(false);
        const text = describeHttpError(err);
        this.turns.update((list) => [...list, { from: 'agent', text: `⚠ ${text}` }]);
      },
    });
  }
}

function newSessionId(): string {
  return `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
