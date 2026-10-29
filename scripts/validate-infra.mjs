#!/usr/bin/env node
/**
 * Проверка согласованности инфраструктуры без Docker/Helm/Terraform (их проверки — в CI):
 *  • все YAML/JSON парсятся;
 *  • depends_on в compose ссылается на существующие сервисы, монтируемые файлы и Dockerfile существуют;
 *  • gRPC-порты сервисов совпадают в compose, common.env и Helm values;
 *  • топики Kafka одинаковы в локальном скрипте и в Terraform (prod), у потребителей есть ACL.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseAllDocuments } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (message) => errors.push(message);
const read = (path) => readFileSync(join(root, path), 'utf8');

function walk(dir, predicate, acc = []) {
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(dir, entry);
    if (statSync(join(root, path)).isDirectory()) walk(path, predicate, acc);
    else if (predicate(path)) acc.push(path);
  }
  return acc;
}

// 1. Синтаксис YAML (кроме Go-шаблонов Helm) и JSON
const yamlFiles = [
  ...walk('infra', (p) => /\.ya?ml$/.test(p) && !p.includes(`masterly-service${'\\'}templates`) && !p.includes('masterly-service/templates')),
  ...walk('.github', (p) => /\.ya?ml$/.test(p)),
];
for (const file of yamlFiles) {
  for (const doc of parseAllDocuments(read(file))) {
    if (doc.errors.length) fail(`${file}: ${doc.errors[0].message}`);
  }
}
const jsonFiles = [...walk('infra', (p) => p.endsWith('.json')), 'renovate.json'];
for (const file of jsonFiles) {
  try {
    JSON.parse(read(file));
  } catch (error) {
    fail(`${file}: ${error.message}`);
  }
}

// 2. Docker Compose
const compose = parse(read('infra/docker/compose.yaml'));
const services = compose.services;
for (const [name, service] of Object.entries(services)) {
  for (const dep of Object.keys(service.depends_on ?? {})) {
    if (!services[dep]) fail(`compose: ${name} зависит от несуществующего ${dep}`);
  }
  const dockerfile = service.build?.dockerfile;
  if (dockerfile && !existsSync(join(root, dockerfile))) fail(`compose: ${name}: нет ${dockerfile}`);
  for (const volume of service.volumes ?? []) {
    const source = String(volume).split(':')[0];
    if (source.startsWith('./') && !existsSync(join(root, 'infra/docker', source))) fail(`compose: ${name}: нет файла ${source}`);
  }
}

// 3. Порты gRPC: compose ↔ common.env ↔ Helm values
const env = Object.fromEntries(
  read('infra/docker/env/common.env')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')),
);
for (const [name, service] of Object.entries(services)) {
  const port = service.environment?.GRPC_PORT;
  if (!port) continue;
  const fromEnv = env[`GRPC_${name.toUpperCase()}`];
  if (fromEnv !== `${name}:${port}`) fail(`порт gRPC ${name}: compose ${port}, common.env ${fromEnv}`);
  const valuesPath = `infra/helm/values/${name}.yaml`;
  if (!existsSync(join(root, valuesPath))) {
    fail(`нет Helm values для ${name}`);
    continue;
  }
  const values = parse(read(valuesPath));
  if (String(values.ports?.grpc) !== String(port)) fail(`порт gRPC ${name}: compose ${port}, helm ${values.ports?.grpc}`);
  if (values.nameOverride !== name) fail(`${valuesPath}: nameOverride ${values.nameOverride} ≠ ${name}`);
}

// 4. Kafka: одинаковая топология локально, в staging и в проде; ACL покрывают KEDA; у потребляемых топиков есть retry/DLQ
const createTopics = read('infra/docker/kafka/create-topics.sh');
const localTopics = new Set([...createTopics.matchAll(/^create\s+([a-z.0-9]+)/gm)].map((m) => m[1]));
const localRetried = new Set((createTopics.match(/^for topic in ([^;]+); do/m)?.[1] ?? '').split(/\s+/).filter(Boolean));
const tfTopics = (file) => new Set([...read(file).matchAll(/"([a-z.0-9]+)"\s*=\s*\{\s*partitions/g)].map((m) => m[1]));
const prodTopics = tfTopics('infra/terraform/envs/production.tfvars');
const stagingTopics = tfTopics('infra/terraform/envs/staging.tfvars');
const isBase = (topic) => !/\.(retry|dlq)$/.test(topic);

for (const topic of localTopics) {
  if (!prodTopics.has(topic)) fail(`Kafka: топик ${topic} есть локально, но нет в production.tfvars`);
}
for (const topic of [...prodTopics].filter(isBase)) {
  if (!localTopics.has(topic)) fail(`Kafka: топик ${topic} есть в production.tfvars, но не создаётся локально`);
  if (!stagingTopics.has(topic)) fail(`Kafka: топик ${topic} есть в production.tfvars, но нет в staging.tfvars`);
}

const list = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const acl = Object.fromEntries(
  [...read('infra/terraform/kafka.tf').matchAll(/^\s*([a-z]+)\s*=\s*\{\s*produce\s*=\s*\[([^\]]*)\],\s*consume\s*=\s*\[([^\]]*)\]\s*\}/gm)].map((m) => [
    m[1],
    { produce: list(m[2]), consume: list(m[3]) },
  ]),
);
if (Object.keys(acl).length === 0) fail('kafka.tf: не удалось разобрать kafka_acl');
for (const [service, { produce, consume }] of Object.entries(acl)) {
  for (const topic of [...produce, ...consume]) {
    if (!prodTopics.has(topic)) fail(`ACL ${service}: топика ${topic} нет в production.tfvars`);
  }
  for (const topic of consume) {
    if (!localRetried.has(topic)) fail(`Kafka: ${topic} читает ${service}, но локально для него нет retry/DLQ`);
  }
}
for (const file of readdirSync(join(root, 'infra/helm/values')).filter((f) => f.endsWith('.yaml'))) {
  const values = parse(read(`infra/helm/values/${file}`));
  for (const topic of values.keda?.topics ?? []) {
    const service = values.nameOverride;
    if (!acl[service]?.consume.includes(topic)) fail(`ACL: ${service} масштабируется по ${topic}, но не имеет права consume`);
  }
}

if (errors.length) {
  console.error(`✗ Найдено проблем: ${errors.length}`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`✓ Инфраструктура согласована: ${yamlFiles.length} YAML, ${jsonFiles.length} JSON, ${Object.keys(services).length} сервисов compose, ${localTopics.size} топиков`);
console.log(`  проверено относительно ${relative(process.cwd(), root) || '.'}`);
