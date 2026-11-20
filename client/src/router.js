import { createRouter, createWebHistory } from 'vue-router'
import { initialize, checkRound, state, complete, reviewReady } from './state.js'
const StudentStart = () => import('./pages/StudentStart.vue')
const AbcPage = () => import('./pages/AbcPage.vue')
const LayoutPage = () => import('./pages/LayoutPage.vue')
const SubmitPage = () => import('./pages/SubmitPage.vue')
const TeacherPage = () => import('./pages/TeacherPage.vue')
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', redirect: '/student' },
  { path: '/student', component: StudentStart, meta: { step: 'start' } },
  { path: '/student/abc', component: AbcPage, meta: { step: 'abc' } },
  { path: '/student/layout', component: LayoutPage, meta: { step: 'layout' } },
  { path: '/student/review', component: () => import('./pages/DocumentReview.vue'), meta: { step: 'review' } },
  { path: '/student/submit', component: SubmitPage, meta: { step: 'submit' } },
  { path: '/teacher', component: TeacherPage },
  { path: '/:pathMatch(.*)*', redirect: '/student' },
] })
router.beforeEach(async (to, from) => {
  if (!to.meta.step) return
  await initialize()
  if (from.meta.step) await checkRound()
  if (to.meta.step !== 'start' && (!state.draft || !state.round)) return '/student'
  if (state.draft?.submissionResult && to.meta.step === 'start') return '/student/submit'
  if (['layout', 'review', 'submit'].includes(to.meta.step) && !complete.value && !state.draft?.submissionResult) return '/student/abc'
  if (to.meta.step === 'review' && !state.draft?.review) return '/student/layout'
  if (to.meta.step === 'submit' && !reviewReady.value && !state.draft?.submissionResult) return state.draft?.review ? '/student/review' : '/student/layout'
  if (!from.name && !from.matched.length && to.meta.step === 'start' && state.draft && state.draft.step !== 'start') return `/student/${state.draft.submissionResult ? 'submit' : state.draft.step}`
  if (state.draft) state.draft.step = to.meta.step
})
export default router
