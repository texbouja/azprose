<script lang="ts">
import { X } from "@/lib/icons";
import { Button, Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import sadUrl from "@/assets/mascot/az-sad.svg";
import exciteUrl from "@/assets/mascot/az-excite.svg";

let t = $derived(getT($language));

export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

let {
  open,
  message,
  onDismiss,
  action = undefined,
  secondAction = undefined,
  variant = "error",
  durationMs = undefined,
}: {
  open: boolean;
  message: string;
  onDismiss: () => void;
  action?: ToastAction;
  secondAction?: ToastAction;
  variant?: "error" | "info";
  durationMs?: number | null;
} = $props();

const DEFAULT_DURATION: Record<"error" | "info", number | null> = {
  error: null,
  info: 3500,
};

const EXIT_MS = 220;

let leaving = $state(false);

let effectiveDuration = $derived(
  durationMs === undefined ? DEFAULT_DURATION[variant] : durationMs,
);

$effect(() => {
  if (!open) {
    leaving = false;
    return;
  }
  if (effectiveDuration == null) return;
  const timer = window.setTimeout(() => {
    leaving = true;
    window.setTimeout(onDismiss, EXIT_MS);
  }, effectiveDuration);
  return () => window.clearTimeout(timer);
});

const dismissWithExit = () => {
  leaving = true;
  window.setTimeout(onDismiss, EXIT_MS);
};

let art = $derived(variant === "info" ? exciteUrl : sadUrl);
</script>

{#snippet dismissIcon()}
  <Icon icon={X} size={11} strokeWidth={1.5} />
{/snippet}

{#if open}
  <div
    class="mdv-toast mdv-toast--{variant}{leaving ? " is-leaving" : ""}"
    role={variant === "error" ? "alert" : "status"}
  >
    <img
      src={art}
      alt=""
      aria-hidden="true"
      width={28}
      height={28}
      draggable={false}
      class="mdv-toast__art"
    />
    <span class="mdv-toast__msg">{message}</span>
    {#if action}
      <button
        type="button"
        class="mdv-toast__action"
        onclick={() => { void action.onClick(); dismissWithExit(); }}
      >
        {action.label}
      </button>
    {/if}
    {#if secondAction}
      <button
        type="button"
        class="mdv-toast__action"
        onclick={() => { void secondAction.onClick(); dismissWithExit(); }}
      >
        {secondAction.label}
      </button>
    {/if}
    <Button
      class="mdv-toast__dismiss"
      title={t("toast.dismiss")}
      aria-label={t("toast.dismiss")}
      onclick={dismissWithExit}
      icon={dismissIcon}
    />
  </div>
{/if}
