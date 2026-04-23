<?php
declare(strict_types=1);

function getOllamaBaseUrl(): string
{
	$baseUrl = getenv('OLLAMA_BASE_URL');
	if ($baseUrl !== false && is_string($baseUrl) && $baseUrl !== '') {
		return rtrim($baseUrl, '/');
	}
	
	return 'http://127.0.0.1:11434';
}

function getOllamaModel(): string
{
	$model = getenv('OLLAMA_MODEL');
	if ($model !== false && is_string($model) && $model !== '') {
		return normalizeOllamaModel($model);
	}
	
	return 'qwen2.5:1.5b';
}

function normalizeOllamaModel(string $model): string
{
	$model = trim($model);
	if ($model === '') {
		return 'qwen2.5:1.5b';
	}

	if (!str_contains($model, ':')) {
		return $model . ':latest';
	}

	return $model;
}

function getOllamaTimeout(): int
{
	$timeout = getenv('OLLAMA_TIMEOUT');
	if ($timeout !== false && is_string($timeout) && is_numeric($timeout)) {
		return (int) $timeout;
	}
	
	return 10;
}

function getOllamaTemperature(): float
{
	$temperature = getenv('OLLAMA_TEMPERATURE');
	if ($temperature !== false && is_string($temperature) && is_numeric($temperature)) {
		return (float) $temperature;
	}
	
	return 0.2;
}

function getOllamaTopP(): float
{
	$topP = getenv('OLLAMA_TOP_P');
	if ($topP !== false && is_string($topP) && is_numeric($topP)) {
		return (float) $topP;
	}

	return 0.9;
}

function getOllamaTopK(): int
{
	$topK = getenv('OLLAMA_TOP_K');
	if ($topK !== false && is_string($topK) && is_numeric($topK)) {
		return (int) $topK;
	}
	
	return 40;
}

function getOllamaModelsPath(): string
{
	$modelsPath = getenv('OLLAMA_MODELS');
	if ($modelsPath !== false && is_string($modelsPath) && $modelsPath !== '') {
		return $modelsPath;
	}

	return 'F:\\ollama';
}
