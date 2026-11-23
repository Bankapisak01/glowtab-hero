// A generation gate owns every loaded bundle, including obsolete results.
export function createModelSwitcher({ load, install }) {
  let generation = 0,
    current = null,
    disposed = false;
  async function select(id) {
    if (disposed) throw Error("Model disposed");
    const request = ++generation;
    if (current?.id === id) return { committed: true, id };
    let next;
    try {
      next = await load(id);
    } catch (error) {
      if (request !== generation || disposed) return { committed: false, id };
      throw error;
    }
    if (request !== generation || disposed) {
      next.dispose();
      return { committed: false, id };
    }
    const previous = current;
    try {
      install(next, previous);
    } catch (error) {
      next.dispose();
      throw error;
    }
    current = next;
    previous?.dispose();
    return { committed: true, id };
  }
  return {
    select,
    get current() {
      return current;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      current?.dispose();
      current = null;
    },
  };
}
