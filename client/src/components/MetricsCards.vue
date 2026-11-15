<script setup>
import { number, percent } from '../format.js'
defineProps({ metrics: Object })
</script>
<template><div class="metrics"><div class="metric"><span>初始拣货距离</span><strong>{{ number(metrics.baselineDistance) }} <small>米</small></strong></div><div class="metric"><span>当前拣货距离</span><strong>{{ number(metrics.currentDistance) }} <small>米</small></strong></div><div class="metric"><span>改善率</span><strong :class="metrics.improvement < 0 ? 'error' : 'success'">{{ percent(metrics.improvement, true) }}</strong></div></div></template>
