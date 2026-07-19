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
  it('所有选项均为默认权重时保持顺序循环', () => {
    const inst = useRollCall({
      options: ['A', 'B', 'C'],
      duration,
    });
    inst.value.next();
    expect(inst.value.currentIndex).toBe(0);
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(2);
    expect(inst.value.currentValue).toBe('C');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(0);
    expect(inst.value.currentValue).toBe('A');
  });

  it('加权采样分布大致符合权重比', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration, weight: 1 },
        { value: 'B', duration, weight: 3 },
      ],
      duration,
    });
    let countA = 0;
    let countB = 0;
    for (let i = 0; i < 10000; i++) {
      inst.value.next();
      if (inst.value.currentValue === 'A')
        countA++;
      else
        countB++;
    }
    expect(countB).toBeGreaterThan(countA * 2.5);
    expect(countB).toBeLessThan(countA * 3.5);
  });

  it('支持非整数权重', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration, weight: 1.5 },
        { value: 'B', duration, weight: 1 },
      ],
      duration,
    });
    let countA = 0;
    let countB = 0;
    for (let i = 0; i < 10000; i++) {
      inst.value.next();
      if (inst.value.currentValue === 'A')
        countA++;
      else
        countB++;
    }
    expect(countA).toBeGreaterThan(countB);
  });

  it('非法权重回退为 1（保持顺序循环）', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration, weight: Number.NaN },
        { value: 'B', duration, weight: 0 },
        { value: 'C', duration, weight: -1 },
        { value: 'D', duration, weight: Number.POSITIVE_INFINITY },
      ],
      duration,
    });
    inst.value.next();
    expect(inst.value.currentIndex).toBe(0);
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(2);
    expect(inst.value.currentValue).toBe('C');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(3);
    expect(inst.value.currentValue).toBe('D');
  });

  it('字符串与对象混合时按权重抽样', () => {
    const inst = useRollCall({
      options: ['A', { value: 'B', duration, weight: 2 }],
      duration,
    });
    let countA = 0;
    let countB = 0;
    for (let i = 0; i < 10000; i++) {
      inst.value.next();
      if (inst.value.currentValue === 'A')
        countA++;
      else
        countB++;
    }
    expect(countB).toBeGreaterThan(countA);
  });

  it('对象未指定权重时默认为 1（顺序循环）', () => {
    const inst = useRollCall({
      options: [
        { value: 'A', duration },
        { value: 'B', duration },
      ],
      duration,
    });
    inst.value.next();
    expect(inst.value.currentIndex).toBe(0);
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('B');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(0);
    expect(inst.value.currentValue).toBe('A');
    inst.value.next();
    expect(inst.value.currentIndex).toBe(1);
    expect(inst.value.currentValue).toBe('B');
  });

  it('纯字符串选项顺序循环并回绕', () => {
    const inst = useRollCall({
      options: ['A', 'B'],
      duration,
    });
    const expected = ['A', 'B', 'A', 'B', 'A'];
    for (const v of expected) {
      inst.value.next();
      expect(inst.value.currentValue).toBe(v);
    }
  });
});
