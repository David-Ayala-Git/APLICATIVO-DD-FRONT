import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { CommsApi, CrmApi } from '../../core/api';
import { Client, WhatsappMessage } from '../../core/models';
import { collection } from '../../core/state/collection';
import { describeHttpError } from '../../core/ui/http-error';
import { ToastService } from '../../core/ui/toast.service';
import { AsyncStateComponent } from '../../shared/components/async-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { PageHeadComponent } from '../../shared/components/page-head.component';
import { RippleDirective } from '../../shared/directives/ripple.directive';
import { initials, normalize, timeShort } from '../../shared/format';
import { messageStatusLabel } from '../../shared/labels';

interface Conversation {
  phone: string;
  clientName: string;
  messages: WhatsappMessage[];
  last: WhatsappMessage;
  unread: number;
}

/**
 * Bandeja de WhatsApp Business. El envio siempre va por plantilla aprobada en
 * Meta: la Cloud API rechaza texto libre fuera de la ventana de 24 horas desde
 * el ultimo mensaje del cliente, asi que la consola no ofrece ese atajo.
 */
@Component({
  selector: 'app-whatsapp',
  imports: [
    ReactiveFormsModule,
    PageHeadComponent,
    AsyncStateComponent,
    ModalComponent,
    RippleDirective,
  ],
  templateUrl: './whatsapp.component.html',
})
export class WhatsappComponent {
  private readonly api = inject(CommsApi);
  private readonly crm = inject(CrmApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly messages = collection(() => this.api.messages(), [] as WhatsappMessage[]);
  protected readonly clients = collection(
    () => this.crm.clients().pipe(catchError(() => of([] as Client[]))),
    [] as Client[],
  );

  protected readonly search = signal('');
  protected readonly selectedPhone = signal<string | null>(null);
  protected readonly composing = signal(false);
  protected readonly saving = signal(false);

  protected readonly sendForm = this.fb.nonNullable.group({
    phone: ['', Validators.required],
    templateName: ['', Validators.required],
    bodyParams: ['', Validators.required],
  });

  /** Mensajes agrupados por telefono, como un hilo de conversacion. */
  protected readonly conversations = computed<Conversation[]>(() => {
    const grouped = new Map<string, WhatsappMessage[]>();
    for (const message of this.messages.value()) {
      grouped.set(message.phone, [...(grouped.get(message.phone) ?? []), message]);
    }

    const list: Conversation[] = [];
    for (const [phone, msgs] of grouped) {
      const ordered = [...msgs].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
      list.push({
        phone,
        clientName: this.clientByPhone(phone),
        messages: ordered,
        last: ordered[ordered.length - 1],
        unread: ordered.filter((m) => m.direction === 'IN' && m.status === 'RECEIVED').length,
      });
    }
    return list.sort((a, b) => (a.last.createdAt < b.last.createdAt ? 1 : -1));
  });

  protected readonly filteredConversations = computed(() => {
    const term = normalize(this.search());
    if (!term) {
      return this.conversations();
    }
    return this.conversations().filter((c) =>
      [c.phone, c.clientName, c.last.body].map((v) => normalize(v)).some((v) => v.includes(term)),
    );
  });

  // El tipo explicito importa: con la lista vacia `list[0]` es undefined en
  // tiempo de ejecucion aunque TypeScript lo tipe como Conversation.
  protected readonly active = computed<Conversation | null>(() => {
    const list = this.filteredConversations();
    const phone = this.selectedPhone();
    return list.find((c) => c.phone === phone) ?? list[0] ?? null;
  });

  protected readonly stats = computed(() => {
    const all = this.messages.value();
    return {
      total: all.length,
      incoming: all.filter((m) => m.direction === 'IN').length,
      outgoing: all.filter((m) => m.direction === 'OUT').length,
      failed: all.filter((m) => m.status === 'FAILED').length,
    };
  });

  protected clientByPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    const client = this.clients
      .value()
      .find((c) => c.phone && digits.endsWith(c.phone.replace(/\D/g, '').slice(-10)));
    return client?.fullName ?? phone;
  }

  protected select(phone: string): void {
    this.selectedPhone.set(phone);
  }

  protected openCompose(phone?: string): void {
    this.sendForm.reset({
      phone: phone ?? this.active()?.phone ?? '',
      templateName: '',
      bodyParams: '',
    });
    this.composing.set(true);
  }

  protected close(): void {
    this.composing.set(false);
  }

  protected send(): void {
    if (this.sendForm.invalid || this.saving()) {
      this.sendForm.markAllAsTouched();
      return;
    }
    const raw = this.sendForm.getRawValue();
    const params = raw.bodyParams
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    if (params.length === 0) {
      this.sendForm.controls.bodyParams.setErrors({ required: true });
      return;
    }

    this.saving.set(true);
    this.api
      .send({ phone: raw.phone, templateName: raw.templateName, bodyParams: params })
      .subscribe({
        next: (message) => {
          this.saving.set(false);
          this.composing.set(false);
          this.selectedPhone.set(message.phone);
          this.toast.success('Plantilla enviada a WhatsApp.');
          this.messages.reload();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(describeHttpError(err));
        },
      });
  }

  protected readonly initials = initials;
  protected readonly timeShort = timeShort;
  protected readonly statusLabel = messageStatusLabel;
}
