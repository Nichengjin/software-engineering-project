import { ApiError } from '../errors.js';

export type Admission = { termId: string; release(): void };
type State = { status: 'OPEN' | 'CLOSING' | 'CLOSED'; count: number; waiters: (() => void)[] };

export class Gates {
  private states = new Map<string, State>();
  private state(id: string): State {
    let state = this.states.get(id);
    if (!state) { state = { status: 'OPEN', count: 0, waiters: [] }; this.states.set(id, state); }
    return state;
  }
  status(id: string) { return this.state(id).status; }
  set(id: string, status: State['status']) { this.state(id).status = status; }
  admit(id: string): Admission {
    const state = this.state(id);
    if (state.status !== 'OPEN') throw new ApiError(409, state.status === 'CLOSING' ? 'CLOSING' : 'ALREADY_CLOSED', '选课正在关闭或已关闭');
    state.count++;
    let released = false;
    return { termId: id, release: () => {
      if (released) return;
      released = true;
      if (--state.count === 0) state.waiters.splice(0).forEach(resolve => resolve());
    } };
  }
  beginClose(id: string) {
    const token = this.admit(id);
    this.set(id, 'CLOSING');
    token.release();
  }
  async drain(id: string) {
    const state = this.state(id);
    if (state.count) await new Promise<void>(resolve => state.waiters.push(resolve));
  }
}
