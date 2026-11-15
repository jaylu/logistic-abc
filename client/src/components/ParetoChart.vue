<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])
const props = defineProps({ rows: Array, answers: Object, thresholds: Object })
const element = ref(null)
let chart, observer
function render() {
  if (!chart) return
  const css = getComputedStyle(document.documentElement), color = name => css.getPropertyValue(name).trim()
  chart.setOption({ animation: false, tooltip: { trigger: 'axis' }, grid: { left: 65, right: 50, top: 30, bottom: 25 }, xAxis: { type: 'category', data: props.rows.map(r => r.sku) }, yAxis: [{ type: 'value', name: '销售额（元）' }, { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } }], series: [
    { type: 'bar', data: props.rows.map(r => ({ value: r.salesCents / 100, itemStyle: { color: color({ A: '--a', B: '--b', C: '--c' }[props.answers[r.sku]] || '--unclassified') } })) },
    { type: 'line', yAxisIndex: 1, data: props.rows.map(r => +(r.cumAfter * 100).toFixed(1)), itemStyle: { color: color('--primary') }, markLine: { symbol: 'none', lineStyle: { type: 'dashed' }, data: [{ yAxis: props.thresholds.a * 100 }, { yAxis: props.thresholds.b * 100 }] } },
  ] })
}
onMounted(() => { chart = echarts.init(element.value); render(); observer = new ResizeObserver(() => chart.resize()); observer.observe(element.value) })
watch(() => [props.rows, props.answers, props.thresholds], render, { deep: true })
onUnmounted(() => { observer?.disconnect(); chart?.dispose() })
</script>
<template><div ref="element" class="pareto" role="img" aria-label="帕累托图：销售额柱状图与累计占比折线，详细数据见上方表格。" /></template>
