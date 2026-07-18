import type { Ref } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { ref } from 'vue';

/** 高级待点选项 */
export interface RollCallAdvancedOption {
  /** 选项值 */
  value: string
  /** 此选项在随机时停留的时间（单位：ms） */
  duration: number
  /**
   * 此选项的权重（默认为 1）。
   *
   * 权重为 n 的选项会在待选队列中占据 n 个位置，因此被抽中的概率正比于权重。
   * 例如 `A1 B2 C3` 展开后的待选队列为 `A B B C C C`。
   *
   * - 非整数权重向下取整（如 `2.9` → `2`）。
   * - 权重小于 1 的值（如 `0`、负数）会被视为 1。
   * - 非有限值（如 `NaN` / `±Infinity`）会被视为 1，避免展开时死循环或静默丢弃选项。
   */
  weight?: number
}

/** 待点选项 */
export type RollCallOption = string | RollCallAdvancedOption;

export interface RollCallConfig {
  /** 随机选项 */
  options: RollCallOption[]
  /** 选项切换间隔时间（单位：ms） */
  duration: number
  /** 开始的下标 */
  defaultIndex?: number
  /** 开始显示的值 */
  defaultValue?: string
}

export interface RollCallController {
  /** 当前随机值 */
  currentValue?: string
  /** 当前随机值的下标（在按权重展开后的待选队列中） */
  currentIndex?: number
  /** 前进到下一个选项 */
  next: () => void
  /** 开始随机 */
  start: () => void
  /** 暂停随机 */
  pause: () => void
  /** 随机是否已经暂停 */
  isActive: boolean
  /** 重置为默认状态 */
  reset: () => void
}

/**
 * 把 `RollCallOption` 展开为按权重重复的待选队列。
 *
 * - 字符串视为权重 1。
 * - 对象的权重默认为 1。
 * - 权重小于 1 的值会被视为 1。
 * - 非有限值（`NaN` / `±Infinity`）会被视为 1，避免展开时死循环或静默丢弃选项。
 * - 非整数权重向下取整。
 */
function expandOptions(options: RollCallOption[]): RollCallOption[] {
  const queue: RollCallOption[] = [];
  for (const option of options) {
    const declared = typeof option === 'object' ? option.weight : undefined;
    const weight = declared !== undefined && Number.isFinite(declared)
      ? Math.max(1, Math.floor(declared))
      : 1;
    for (let i = 0; i < weight; i++)
      queue.push(option);
  }
  return queue;
}

/**
 * 点名。
 *
 * 默认暂停，需要调用返回值的 `.value.start()` 来开始。
 */
export default function useRollCall(config: RollCallConfig): Ref<RollCallController> {
  const { options, duration, defaultIndex, defaultValue } = config;

  // 按权重展开待选队列（无权重时退化为原 options）
  const queue = expandOptions(options);

  const currentIndex = ref<number | undefined>(defaultIndex);
  const currentValue = ref<string | undefined>(defaultValue);
  const currentDuration = ref(duration);

  const next = () => {
    if (queue.length === 0) // 空名单保护：避免在无待点选项时访问 queue[0] 报错
      return;
    let i = (currentIndex.value ?? -1) + 1; // 若未开始，下一个为第一个，即下标 -1+1
    if (i >= queue.length) // 越界
      i = 0;
    const incoming = queue[i]!;
    currentValue.value = rollCallOptionToString(incoming);
    currentIndex.value = i;

    if (typeof incoming === 'string') { // 选项未覆盖 duration
      currentDuration.value = config.duration;
    } else if (incoming.duration !== config.duration) { // 选项覆盖了 duration
      currentDuration.value = incoming.duration;
    }
  };

  const { pause, resume, isActive } = useIntervalFn(next, duration);
  pause();
  const start = () => {
    if (isActive.value)
      return;
    next();
    resume();
  };
  const reset = () => {
    pause();
    currentValue.value = currentIndex.value = undefined;
  };

  return ref({
    currentValue,
    currentIndex,
    next,
    pause,
    start,
    isActive,
    reset,
  });
};

export function rollCallOptionToString(option: RollCallOption) {
  if (typeof option === 'string')
    return option;
  return option.value;
}
