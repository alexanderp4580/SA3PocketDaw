<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value: number;
  export let min: number;
  export let max: number;
  export let scale: 'linear' | 'log' = 'linear';
  export let label: string;
  export let disabled: boolean = false;
  export let formatValue: (v: number) => string = (v) => v.toFixed(1);

  const dispatch = createEventDispatcher<{ change: { value: number } }>();

  const STEPS = 1000;

  function toNormalized(v: number): number {
    const clamped = Math.min(max, Math.max(min, v));
    if (scale === 'log') {
      return (Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min));
    }
    return (clamped - min) / (max - min);
  }

  function fromNormalized(n: number): number {
    if (scale === 'log') {
      return Math.exp(Math.log(min) + n * (Math.log(max) - Math.log(min)));
    }
    return min + n * (max - min);
  }

  $: normalized = toNormalized(value);

  let editing = false;
  let editText = '';
  let popupInput: HTMLInputElement | undefined;

  function handleInput(event: Event) {
    const raw = Number((event.currentTarget as HTMLInputElement).value) / STEPS;
    dispatch('change', { value: fromNormalized(raw) });
  }

  function openPopup() {
    if (disabled) return;
    editText = value.toFixed(2);
    editing = true;
    // Wait for the input to mount, then focus + select it.
    setTimeout(() => {
      popupInput?.focus();
      popupInput?.select();
    });
  }

  function commitPopup() {
    const raw = parseFloat(editText);
    if (!Number.isNaN(raw)) {
      const clamped = Math.min(max, Math.max(min, raw));
      dispatch('change', { value: clamped });
    }
    editing = false;
  }

  function cancelPopup() {
    editing = false;
  }

  function handlePopupKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      commitPopup();
    } else if (event.key === 'Escape') {
      cancelPopup();
    }
  }
</script>

<div class="hslider" class:disabled>
  <span class="hslider-label">{label}</span>
  <input
    type="range"
    class="hslider-input"
    style="--fill: {normalized * 100}%"
    min={0}
    max={STEPS}
    step={1}
    value={normalized * STEPS}
    {disabled}
    aria-label={label}
    aria-valuetext={formatValue(value)}
    on:input={handleInput}
  />
  <div class="hslider-value-wrap">
    <button
      type="button"
      class="hslider-value"
      {disabled}
      aria-label="Set {label} value"
      on:click={openPopup}
    >
      {formatValue(value)}
    </button>
    {#if editing}
      <div class="hslider-popup">
        <input
          type="text"
          inputmode="decimal"
          bind:value={editText}
          bind:this={popupInput}
          on:keydown={handlePopupKeydown}
          on:blur={commitPopup}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .hslider {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
  }

  .hslider.disabled {
    opacity: 0.4;
  }

  .hslider-label {
    flex: 0 0 2.75rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ui-text-muted);
    letter-spacing: 0.02em;
  }

  .hslider-value-wrap {
    position: relative;
    flex: 0 0 4.5rem;
  }

  .hslider-value {
    width: 100%;
    text-align: right;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--ui-text-dim);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 0.125rem 0.25rem;
    font-family: inherit;
    cursor: pointer;
  }

  .hslider-value:hover:not(:disabled) {
    border-color: var(--ui-border);
    color: var(--ui-text);
  }

  .hslider-value:disabled {
    cursor: not-allowed;
  }

  .hslider-popup {
    position: absolute;
    top: calc(100% + 0.25rem);
    right: 0;
    z-index: 20;
    padding: 0.375rem;
    background: var(--ui-panel-2, #1a1f28);
    border: 1px solid var(--band-ink, var(--ui-border));
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .hslider-popup input {
    width: 5.5rem;
    padding: 0.25rem 0.375rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--ui-border);
    border-radius: 3px;
    color: var(--ui-text);
    font-size: 0.8rem;
    font-family: inherit;
    text-align: right;
  }

  .hslider-popup input:focus {
    outline: none;
    border-color: var(--band-ink, var(--ui-text));
  }

  .hslider-input {
    flex: 1;
    min-width: 0;
    -webkit-appearance: none;
    appearance: none;
    height: 28px;
    background: transparent;
    cursor: pointer;
    touch-action: pan-y;
  }

  .hslider-input:disabled {
    cursor: not-allowed;
  }

  /* Track */
  .hslider-input::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      var(--band-ink, var(--ui-text)) var(--fill),
      var(--ui-panel-2) var(--fill)
    );
  }

  .hslider-input::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--ui-panel-2);
  }

  .hslider-input::-moz-range-progress {
    height: 6px;
    border-radius: 3px;
    background: var(--band-ink, var(--ui-text));
  }

  /* Thumb */
  .hslider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    margin-top: -7px;
    border-radius: 50%;
    background: var(--band-ink, var(--ui-text));
    border: 2px solid rgba(0, 0, 0, 0.45);
    cursor: grab;
  }

  .hslider-input::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--band-ink, var(--ui-text));
    border: 2px solid rgba(0, 0, 0, 0.45);
    cursor: grab;
  }

  .hslider-input:active::-webkit-slider-thumb {
    cursor: grabbing;
  }
</style>
