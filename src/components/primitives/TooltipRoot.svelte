<script lang="ts">
const SHOW_DELAY_MS = 320;
const HIDE_DELAY_MS = 80;

let tip = $state<{
  text: string;
  left: number;
  top: number;
  below: boolean;
} | null>(null);

$effect(() => {
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let currentTrigger: HTMLElement | null = null;

  const findTrigger = (el: Element | null): HTMLElement | null => {
    let node = el;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement && node.dataset.tooltip) return node;
      node = node.parentElement;
    }
    return null;
  };

  const compute = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const text = el.dataset.tooltip ?? "";
    const below = rect.top + rect.height / 2 < window.innerHeight / 2;
    const idealLeft = rect.left + rect.width / 2;
    const top = below ? rect.bottom + 6 : rect.top - 6;
    const PADDING = 12;
    const approxWidth = Math.min(280, text.length * 6.6 + 16);
    const halfW = approxWidth / 2;
    const left = Math.max(
      PADDING + halfW,
      Math.min(window.innerWidth - PADDING - halfW, idealLeft),
    );
    return { text, left, top, below };
  };

  const scheduleShow = (el: HTMLElement) => {
    if (showTimer != null) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      tip = compute(el);
    }, SHOW_DELAY_MS);
  };

  const scheduleHide = () => {
    if (showTimer != null) clearTimeout(showTimer);
    if (hideTimer != null) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => (tip = null), HIDE_DELAY_MS);
  };

  const onOver = (e: MouseEvent) => {
    const target = findTrigger(e.target as Element);
    if (!target) return;
    if (target === currentTrigger) return;
    currentTrigger = target;
    scheduleShow(target);
  };

  const onOut = (e: MouseEvent) => {
    const target = findTrigger(e.target as Element);
    if (!target) return;
    const next = findTrigger((e.relatedTarget as Element) ?? null);
    if (next === target) return;
    if (next === currentTrigger) return;
    currentTrigger = next;
    if (!next) scheduleHide();
    else scheduleShow(next);
  };

  const dismiss = () => {
    currentTrigger = null;
    if (showTimer != null) clearTimeout(showTimer);
    tip = null;
  };

  document.addEventListener("mouseover", onOver);
  document.addEventListener("mouseout", onOut);
  document.addEventListener("scroll", dismiss, true);
  document.addEventListener("keydown", dismiss);
  window.addEventListener("blur", dismiss);
  return () => {
    document.removeEventListener("mouseover", onOver);
    document.removeEventListener("mouseout", onOut);
    document.removeEventListener("scroll", dismiss, true);
    document.removeEventListener("keydown", dismiss);
    window.removeEventListener("blur", dismiss);
    if (showTimer != null) clearTimeout(showTimer);
    if (hideTimer != null) clearTimeout(hideTimer);
  };
});
</script>

{#if tip}
  <div
    class="mdv-tooltip mdv-tooltip--{tip.below ? 'below' : 'above'}"
    role="tooltip"
    style:left={tip.left + "px"}
    style:top={tip.top + "px"}
  >
    {tip.text}
  </div>
{/if}
