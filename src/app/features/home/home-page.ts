import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from '../../shared/ui/card';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { WorkspaceStore } from '../people/workspace.store';

@Component({ selector: 'app-home-page', imports: [RouterLink, Card, Button, Icon], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stack"><section class="hero"><div><p class="eyebrow">Cada paso cuenta</p><h1>El siguiente paso<br />empieza contigo.</h1>
    <p>Tu espacio está preparado. Empieza por el perfil y construye una base para acompañar cada avance.</p>
    <a appButton [routerLink]="['/people', workspace.activePerson()?.id]">Completar perfil <app-icon name="arrow" /></a></div>
    <div class="hero-art" aria-hidden="true"><span class="orbit one"></span><span class="orbit two"></span><span class="art-mark"><app-icon name="training" /></span><span class="art-note">A TU RITMO</span></div></section>
    <div class="grid"><app-card><span class="badge"><app-icon name="check" /> Tu base está lista</span><h2>Un perfil que te acompaña</h2>
      <p class="muted">{{ workspace.activePerson()?.displayName }} tiene un espacio independiente. El nombre puede repetirse; la identidad, no.</p>
      <p class="identity">ID: {{ workspace.activePerson()?.id }}</p></app-card>
    <app-card><span class="badge"><app-icon name="shield" /> Almacenamiento local</span><h2>Tus datos, en este dispositivo</h2>
      <p class="muted">Los perfiles y borradores se guardan en tu navegador. No se envían a un servidor.</p><a routerLink="/settings">Ver ajustes del espacio →</a></app-card></div>
    <section><p class="eyebrow">Tu espacio</p><h2>Todo conectado con tu progreso.</h2><p class="muted">Planifica rutinas y comidas, registra entrenamientos y consumo real, y compara tu historial.</p>
      <div class="grid">@for (feature of features; track feature.path) { <a class="feature-link" [routerLink]="feature.path"><app-icon [name]="feature.icon" /><div><strong>{{ feature.title }}</strong><small>{{ feature.copy }}</small></div><span class="badge">{{ feature.status }}</span></a> }</div></section>
  </div>`,
  styles: `.hero { position: relative; overflow: hidden; display: grid; padding: clamp(1.5rem, 4vw, 3rem); border-radius: 1.5rem; background: #eaf2ff; border: 1px solid #d4e4ff; } .hero p:not(.eyebrow) { max-width: 30rem; color: var(--muted); } .hero-art { display: none; } h2 { margin-top: 1rem; } .feature-link { display: flex; align-items: center; flex-wrap: wrap; gap: .8rem; text-decoration: none; padding: 1.25rem; background: white; border: 1px solid var(--line); border-radius: 1rem; color: var(--ink); } .feature-link app-icon { color: var(--primary); } .feature-link small { display: block; font-size: .8rem; } .feature-link .badge { margin-left: auto; } @media(min-width:1200px) { .hero { grid-template-columns: 1fr 220px; } .hero-art { display: grid; place-items: center; position: relative; } .orbit { position: absolute; border: 1px solid #bdd2f5; border-radius: 50%; width: 190px; height: 190px; } .orbit.two { width: 260px; height: 260px; } .art-mark { background: var(--primary); color: white; border-radius: 2rem; width: 105px; height: 105px; display: grid; place-items: center; transform: rotate(-12deg); box-shadow: 0 15px 40px #2563eb33; } .art-mark app-icon { width: 65px; height: 65px; } .art-note { position: absolute; bottom: 10px; font-size: .65rem; letter-spacing: .15em; color: var(--primary-dark); background: white; border-radius: 2rem; padding: .4rem .8rem; } }` })
export class HomePage {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly features = [
    { path: '/activity', icon: 'food' as const, title: 'Actividad diaria y objetivos', copy: 'Pasos, trabajo, entrenamiento y objetivos dinámicos', status: 'Disponible' },
    { path: '/routines', icon: 'training' as const, title: 'Rutinas', copy: 'Semanas, días y objetivos por serie', status: 'Planificación disponible' },
    { path: '/exercises', icon: 'training' as const, title: 'Ejercicios', copy: 'Búsqueda, instrucciones e ilustraciones', status: 'Catálogo disponible' },
    { path: '/nutrition', icon: 'food' as const, title: 'Alimentación', copy: 'Catálogo y alimentos personalizados', status: 'Catálogo disponible' },
    { path: '/meal-plans', icon: 'food' as const, title: 'Planes de comidas', copy: 'Semanas, días y alimentos previstos', status: 'Planificación disponible' },
    { path: '/diary', icon: 'food' as const, title: 'Diario alimentario', copy: 'Consumo real y objetivos diarios', status: 'Disponible' },
    { path: '/transfers', icon: 'progress' as const, title: 'Compartir planes', copy: 'Archivo JSON y revisión antes de aplicar', status: 'Disponible' },
    { path: '/progress', icon: 'progress' as const, title: 'Progreso', copy: 'Resultados reales, semana a semana', status: 'Historial disponible' },
  ];
}
