<script setup>
import { time } from '../format.js'
defineProps({ result: Object })
</script>
<template><section class="card score-card"><p class="eyebrow">✓ 提交成功</p><h1>你的实训成绩 <strong>{{ result.scores.total }}</strong><small> / 100</small></h1><div class="metrics"><div v-for="[key,label,max] in result.scoreMax ? Object.entries({abc:'ABC分类',placementValidity:'储位合法性',placementEfficiency:'布局效率',documentReview:'单据审核',reflection:'反思'}).map(([key,label]) => [key,label,result.scoreMax[key]]) : [['abc','ABC 分类',50],['layout','布局优化',40],['reflection','反思',10]]" :key="key" class="metric"><span>{{ label }}</span><strong>{{ result.scores[key] }} <small>/ {{ max }}</small></strong><p>{{ result.feedback[key] }}</p></div></div><p class="muted small">提交编号：{{ result.submissionId }}<br>提交时间：{{ time(result.submittedAt) }}（北京时间）</p></section></template>
