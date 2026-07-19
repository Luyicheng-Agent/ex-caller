import type { Ref } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { ref } from 'vue';

/** 高级待点选项 */
export interface RollCallAdvancedOption {
  /** 选项值 */
  value: string
  /** 此选项在随机时停留的时间（单位：ms） */
  duration: number
  /** 此选项被抽中的权重（默认 1，必须为正有限数，否则视为 1） */
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
  /** 当前随机值的下标 */
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

/** 获取选项的权重：非有限值或 ≤ 0 时视为 1 */
function getWeight(option: RollCallOption): number {
  if (typeof option === 'string')
    return 1;
  const w = option.weight;
  if (w === undefined)
    return 1;
  return Number.isFinite(w) && w > 0 ? w : 1;
}

/** 累计权重与总权重；若所有权重均为默认值 1，则返回 null（保持顺序循环） */
function buildCumulativeWeights(options: RollCallOption[]): { cumulative: number[], total: number } | null {
  let allDefault = true;
  const weights: number[] = [];
  for (const opt of options) {
    const w = getWeight(opt);
    if (w !== 1)
      allDefault = false;
    weights.push(w);
  }
  if (allDefault)
    return null;
  const cumulative: number[] = [];
  let sum = 0;
  for (const w of weights) {
    sum += w;
    cumulative.push(sum);
  }
  return { cumulative, total: sum };
}

/** 通过逆 CDF + 二分查找从累计权重中抽样，返回被选中的下标 */
function sampleWeighted(cumulative: number[], total: number): number {
  const r = Math.random() * total;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < r)
      lo = mid + 1;
    else
      hi = mid;
  }
  return lo;
}

/**
 * 点名。
 *
 * 默认暂停，需要调用返回值的 `.value.start()` 来开始。
 */
export default function useRollCall(config: RollCallConfig): Ref<RollCallController> {
  const { options, duration, defaultIndex, defaultValue } = config;

  const currentIndex = ref<number | undefined>(defaultIndex);
  const currentValue = ref<string | undefined>(defaultValue);
  const currentDuration = ref(duration);

  // 当任一选项设置了非默认权重时使用加权采样，否则保持顺序循环（向后兼容）
  const weightedDist = buildCumulativeWeights(options);

  const next = () => {
    let i: number;
    if (weightedDist) {
      i = sampleWeighted(weightedDist.cumulative, weightedDist.total);
    } else {
      i = (currentIndex.value ?? -1) + 1; // 若未开始，下一个为第一个，即下标 -1+1
      if (i >= options.length) // 越界
        i = 0;
    }
    const incoming = options[i]!;
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
