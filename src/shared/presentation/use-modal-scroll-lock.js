import { watch, onUnmounted } from 'vue';

/**
 * Locks page scroll while a modal is open. Without this, the page behind a
 * modal keeps scrolling on mobile (no way to reach content hidden under the
 * virtual keyboard) while the modal itself scrolls too, which reads as the
 * modal being "stuck"/broken.
 *
 * Uses a shared open-modal counter (not a plain boolean) so two modals
 * overlapping briefly during a transition don't have the first one's close
 * clobber the lock the second one still needs.
 *
 * @param {import('vue').Ref<boolean>} isOpen - Reactive open state of the modal.
 */
let lockCount = 0;
let previousOverflow = '';

function lock() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow;
  }
}

export function useModalScrollLock(isOpen) {
  let locked = false;

  watch(isOpen, (open) => {
    if (open && !locked) {
      locked = true;
      lock();
    } else if (!open && locked) {
      locked = false;
      unlock();
    }
  }, { immediate: true });

  onUnmounted(() => {
    if (locked) {
      locked = false;
      unlock();
    }
  });
}
