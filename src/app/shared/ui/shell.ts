import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkspaceStore } from '../../features/people/workspace.store';
import { Icon, type IconName } from './icon';
import { OfflineStatus } from '../../core/pwa/offline-status';
import { AppUpdates } from '../../core/pwa/app-updates';
import { Button } from './button';
import type { UUID } from '../../core/domain/identity';

@Component({ selector: 'app-shell', imports: [RouterLink, RouterLinkActive, FormsModule, Icon, Button], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html', styleUrl: './shell.scss' })
export class Shell {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly offline = inject(OfflineStatus);
  protected readonly updates = inject(AppUpdates);
  private readonly router = inject(Router);
  protected readonly links: { path: string; label: string; icon: IconName }[] = [
    { path: '/', label: 'Inicio', icon: 'home' }, { path: '/routines', label: 'Rutinas', icon: 'training' },
    { path: '/nutrition', label: 'Alimentación', icon: 'food' }, { path: '/progress', label: 'Progreso', icon: 'progress' },
  ];
  protected async select(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    if (await this.workspace.selectPerson(select.value as UUID)) await this.router.navigateByUrl('/');
    else select.value = this.workspace.settings()!.activePersonId;
  }
}
