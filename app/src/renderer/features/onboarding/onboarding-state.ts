const completedKey = 'dela.onboarding.completed';
const stepKey = 'dela.onboarding.step';
const consentKey = 'dela.onboarding.consent';

// 冒烟与自动化由 main 或各 smoke 脚本在页面 URL 上注入该参数，整个引导直接短路。
export const isSmokeTest = new URLSearchParams(window.location.search).has('smoke-test');

/**
 * 条款接受记录：首次启动的条款接受页写入。
 * 只记「接受过」——使用条款第 14 节写明变更后继续使用即视为接受，所以这里不比对版本、
 * 也不在条款改版后要求重新接受；用户当时读到的是哪一版，由应用版本与 docs 里的日期回溯。
 */
export function hasConsent() {
  return localStorage.getItem(consentKey) === '1';
}

export function saveConsent() {
  localStorage.setItem(consentKey, '1');
}

export function needsWizard() {
  return localStorage.getItem(completedKey) !== '1';
}

/** 接受条款并完成向导后进入主界面；未完成时恢复上次步骤。 */
export function onboardingCompleted() {
  return isSmokeTest || (hasConsent() && !needsWizard());
}

/** 上次停留的向导步骤。 */
export function readWizardStep(): number | null {
  const raw = localStorage.getItem(stepKey);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function saveWizardStep(step: number) {
  localStorage.setItem(stepKey, String(step));
}

export function markOnboardingCompleted() {
  localStorage.setItem(completedKey, '1');
  localStorage.removeItem(stepKey);
}
