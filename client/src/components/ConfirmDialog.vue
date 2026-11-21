<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
defineProps({ message: String, busy: Boolean })
const emit = defineEmits(['confirm', 'cancel'])
const dialog = ref(null)
let previous
onMounted(() => { previous = document.activeElement; dialog.value.showModal() })
onUnmounted(() => previous?.focus())
function close() { previous?.focus(); emit('cancel') }
</script>
<template><dialog ref="dialog" @cancel.prevent="!busy && close()" aria-labelledby="confirm-title"><h2 id="confirm-title">请确认</h2><p>{{ message }}</p><slot /><div class="actions"><button :disabled="busy" @click="close">取消</button><button class="primary" :disabled="busy" @click="emit('confirm')">{{ busy ? '处理中…' : '确认' }}</button></div></dialog></template>
