import { promiseTimeout } from '@vueuse/core';
import useRollCall from '@/utils/roll-call';

const duration = 500;
const rest = 50;

async function wait(times = 1) {
  await promiseTimeout(duration * times + rest);
}

describe.concurrent.todo('useRollCall', () => {
  it('初始化', () => {
    const inst = useRollCall({
      options: ['A', 'B'],
      duration,
    });
    expect(inst.value.isActive).toBe(false);
    expect(inst.value.currentIndex).toBeUndefined();
    expect(inst.value.currentValue).toBeUndefined();
  });

  it('处理传入的默认值', () => {
    const inst = useRollCall({
      options: ['A', 'B'],
      duration,
      defaultIndex: 1,
      defaultValue: 'BBB',
    });
    expect(inst.value.isActive).toBe(false);
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('BBB');
  });

  it('定时下一个', async () => {
    const inst = useRollCall({
      options: ['A', 'B'],
      duration,
    });
    inst.value.start(); // / -> A
    await wait(); // A -> B
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('B');
  });

  it('循环抽取', async () => {
    const inst = useRollCall({
      options: ['A', 'B'],
      duration,
    });
    inst.value.start(); // / -> A
    await wait(2); // A -> B -> A
    expect(inst.value.currentIndex).toBe(0);
    expect(inst.value.currentValue).toBe('A');
  });

  it('暂停后立即停止', async () => {
    const inst = useRollCall({
      options: ['A', 'B', 'C'],
      duration,
    });
    inst.value.start(); // / -> A
    await wait(); // A -> B
    inst.value.pause();
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('B');
    await wait(); // 已暂停
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('B');
  });

  it('恢复后立即下一个并继续', async () => {
    const inst = useRollCall({
      options: ['A', 'B', 'C'],
      duration,
    });
    inst.value.start(); // / -> A
    await wait(); // A -> B
    inst.value.pause();
    await wait(); // 已暂停
    inst.value.start(); // B -> C
    expect(inst.value.currentIndex).toBe(2);
    expect(inst.value.currentValue).toBe('C');
  });

  it('重置', async () => {
    const inst = useRollCall({
      options: ['A', 'B'],
      duration,
    });
    inst.value.start(); // / -> A
    await wait(); // A -> B
    inst.value.reset(); // B -> A
    expect(inst.value.isActive).toBe(false);
    expect(inst.value.currentIndex).toBeUndefined();
    expect(inst.value.currentValue).toBeUndefined();
  });
});

describe('useRollCall (weighted)', () => {
  // 直接调用 next() 避免定时器带来的 flakiness；只验证队列展开与循环逻辑
  it('按权重展开待选队列并循环（A1 B2 C3 → A B B C C C A ...）', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration: 0, weight: 1 },
        { value: 'B', duration: 0, weight: 2 },
        { value: 'C', duration: 0, weight: 3 },
      ],
      duration: 100,
    });
    const expected = ['A', 'B', 'B', 'C', 'C', 'C', 'A'];
    for (const v of expected) {
      inst.value.next();
      expect(inst.value.currentValue).toBe(v);
    }
    expect(inst.value.currentIndex).toBe(0); // 7th next() wraps to index 0
  });

  it('未指定 weight 时默认为 1（与纯字符串等价）', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration: 0 },
        { value: 'B', duration: 0, weight: 2 },
      ],
      duration: 100,
    });
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentValue).toBe('A'); // wrap
  });

  it('纯字符串与带权重的对象混合', () => {
    const inst = useRollCall({
      options: ['A', { value: 'B', duration: 0, weight: 2 }],
      duration: 100,
    });
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
  });

  it('weight < 1 视为 1', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration: 0, weight: 0 },
        { value: 'B', duration: 0, weight: -3 },
      ],
      duration: 100,
    });
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
  });

  it('weight 为非有限值（NaN / Infinity）时视为 1，不抛错也不死循环', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration: 0, weight: Number.NaN },
        { value: 'B', duration: 0, weight: Number.POSITIVE_INFINITY },
        { value: 'C', duration: 0, weight: Number.NEGATIVE_INFINITY },
      ],
      duration: 100,
    });
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentValue).toBe('C');
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
  });

  it('weight 为非整数时向下取整（>=2 的小数取整后仍 >1，区别于"视为 1"）', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration: 0, weight: 2.9 }, // → 2
        { value: 'B', duration: 0, weight: 1.9 }, // → 1
      ],
      duration: 100,
    });
    // 展开队列为 [A, A, B]，能区分"向下取整"（2.9→2）与"视为 1"（2.9→1）
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentValue).toBe('A'); // wrap
  });

  it('空 options 时 next() 不抛错且不改变状态', () => {
    const inst = useRollCall({ options: [], duration: 100 });
    expect(() => inst.value.next()).not.toThrow();
    expect(inst.value.currentValue).toBeUndefined();
    expect(inst.value.currentIndex).toBeUndefined();
  });
});
