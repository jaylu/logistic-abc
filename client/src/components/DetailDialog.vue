<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const emit = defineEmits(['close'])
const dialog = ref(null)
let previous
onMounted(() => { previous = document.activeElement; dialog.value.showModal() })
onUnmounted(() => previous?.focus())
</script>
<template><dialog ref="dialog" class="detail-dialog" aria-labelledby="detail-title" @cancel.prevent="emit('close')"><button class="drawer-close" autofocus @click="emit('close')">关闭详情 ✕</button><slot /></dialog></template>
