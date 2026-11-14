// The conversation box: who is speaking, what they say, and the replies. Click a reply or press its number.
const GRACE = 600;   // a box that has only just appeared ignores keys for this long, in milliseconds

export function createDialogue(sim, { dispatch, onClose }) {
  const el = document.getElementById('dialogue'), { state } = sim;
  let open = false, shownAt = 0;

  function render() {
    const node = sim.story.node();
    if (!node) return close();
    el.textContent = '';
    const who = document.createElement('div'), text = document.createElement('p'), list = document.createElement('div');
    who.className = 'who';
    who.textContent = node.who;
    text.textContent = node.text;
    list.className = 'replies';
    sim.story.choices().forEach((c, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}  ${c.text}${c.ok ? '' : '  (not enough money)'}`;
      b.disabled = !c.ok;
      b.addEventListener('click', () => pick(i));
      list.appendChild(b);
    });
    el.append(who, text, list);
    shownAt = performance.now();
  }
  function pick(i) {
    if (!open) return;
    dispatch(sim.command({ type: 'say', i }));
    if (state.dialogue) render(); else close();
  }
  function close() {
    if (!open) return;
    open = false;
    el.style.display = 'none';
    onClose();
  }
  // Called every frame: shows the box as soon as the rules start a conversation.
  function sync() {
    if (state.dialogue && !open) {
      open = true;
      el.style.display = 'block';
      render();
      return true;
    }
    return false;
  }
  // Number keys pick a reply. Enter or Space only continue when there is a single reply, so a key meant for the
  // game (Space is also the mount's ability) can never decide a story choice. Escape walks away from small talk.
  function key(code) {
    if (!open) return false;
    if (performance.now() - shownAt < GRACE) return true;
    const replies = sim.story.choices().length;
    if (code === 'Escape') { dispatch(sim.command({ type: 'leave' })); if (!state.dialogue) close(); return true; }
    const n = /^Digit[1-4]$/.test(code) ? +code.slice(5) - 1 : (code === 'Enter' || code === 'Space') && replies === 1 ? 0 : -1;
    if (n >= 0) pick(n);
    return true;
  }
  return { sync, key, isOpen: () => open };
}
