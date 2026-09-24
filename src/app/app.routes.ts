import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router, Routes } from '@angular/router';
import { WorkspaceStore } from './features/people/workspace.store';
import { DraftCoordinator } from './core/storage/draft-coordinator';

const workspaceGuard: CanActivateFn = async () => {
  const workspace = inject(WorkspaceStore);
  const router = inject(Router);
  if (!workspace.ready()) {
    try { await workspace.refresh(); } catch { return false; }
  }
  return workspace.settings()?.mode ? true : router.parseUrl('/welcome');
};
const onboardingGuard: CanActivateFn = async () => {
  const workspace = inject(WorkspaceStore);
  const router = inject(Router);
  if (!workspace.ready()) { try { await workspace.refresh(); } catch { return false; } }
  return workspace.settings()?.mode ? router.parseUrl('/') : true;
};
const trainerGuard: CanActivateFn = () => inject(WorkspaceStore).isTrainer() || inject(Router).parseUrl('/');
const personGuard: CanActivateFn = route => {
  const workspace = inject(WorkspaceStore);
  const person = workspace.people().find(item => item.id === route.paramMap.get('id'));
  return !!person && !person.archived && (workspace.isTrainer() || person.kind === 'personal') || inject(Router).parseUrl('/');
};
const draftGuard: CanDeactivateFn<unknown> = () => inject(DraftCoordinator).flush();

export const routes: Routes = [
  { path: 'welcome', canActivate: [onboardingGuard], canDeactivate: [draftGuard], title: 'Bienvenido · Entrena con Jesús', loadComponent: () => import('./features/onboarding/onboarding-page').then(m => m.OnboardingPage) },
  { path: '', canActivate: [workspaceGuard], children: [
    { path: '', pathMatch: 'full', title: 'Inicio · Entrena con Jesús', loadComponent: () => import('./features/home/home-page').then(m => m.HomePage) },
    { path: 'people', canActivate: [trainerGuard], title: 'Personas · Entrena con Jesús', loadComponent: () => import('./features/people/people-page').then(m => m.PeoplePage) },
    { path: 'people/new', canActivate: [trainerGuard], canDeactivate: [draftGuard], title: 'Nuevo cliente · Entrena con Jesús', loadComponent: () => import('./features/people/person-page').then(m => m.PersonPage) },
    { path: 'people/:id', canActivate: [personGuard], canDeactivate: [draftGuard], title: 'Perfil · Entrena con Jesús', loadComponent: () => import('./features/people/person-page').then(m => m.PersonPage) },
    { path: 'nutrition', canDeactivate: [draftGuard], title: 'Alimentación · Entrena con Jesús', loadComponent: () => import('./features/nutrition/foods/food-catalog-page').then(m => m.FoodCatalogPage) },
    { path: 'meal-plans', canDeactivate: [draftGuard], title: 'Planes de comidas · Entrena con Jesús', loadComponent: () => import('./features/nutrition/meal-plans/meal-plans-page').then(m => m.MealPlansPage) },
    { path: 'diary', canDeactivate: [draftGuard], title: 'Diario alimentario · Entrena con Jesús', loadComponent: () => import('./features/nutrition/diary/diary-page').then(m => m.DiaryPage) },
    { path: 'exercises', title: 'Ejercicios · Entrena con Jesús', loadComponent: () => import('./features/exercises/exercise-catalog-page').then(m => m.ExerciseCatalogPage) },
    { path: 'routines', canDeactivate: [draftGuard], title: 'Rutinas · Entrena con Jesús', loadComponent: () => import('./features/routines/routines-page').then(m => m.RoutinesPage) },
    { path: 'training', canDeactivate: [draftGuard], title: 'Entrenamiento · Entrena con Jesús', loadComponent: () => import('./features/training/training-page').then(m => m.TrainingPage) },
    { path: 'activity', canDeactivate: [draftGuard], title: 'Actividad · Entrena con Jesús', loadComponent: () => import('./features/activity/activity-page').then(m => m.ActivityPage) },
    { path: 'progress', title: 'Progreso · Entrena con Jesús', loadComponent: () => import('./features/progress/progress-page').then(m => m.ProgressPage) },
    { path: 'transfers', canDeactivate: [draftGuard], title: 'Compartir planes · Entrena con Jesús', loadComponent: () => import('./features/transfers/transfers-page').then(m => m.TransfersPage) },
    { path: 'settings', title: 'Ajustes · Entrena con Jesús', loadComponent: () => import('./features/settings/settings-page').then(m => m.SettingsPage) },
  ] },
  { path: '**', redirectTo: '' },
];
