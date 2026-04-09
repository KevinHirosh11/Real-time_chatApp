<?php
declare(strict_types=1);

function readGeminiLocalEnv(): array
{
	$envPath = dirname(__DIR__) . '/.env';
	if (!is_file($envPath) || !is_readable($envPath)) {
		return [];
	}

	$values = [];
	$lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
	if ($lines === false) {
		return [];
	}

	foreach ($lines as $line) {
		$trimmedLine = trim($line);
		if ($trimmedLine === '' || str_starts_with($trimmedLine, '#') || !str_contains($trimmedLine, '=')) {
			continue;
		}

		[$name, $value] = array_map('trim', explode('=', $trimmedLine, 2));
		if ($name === '') {
			continue;
		}

		$values[$name] = trim($value, "\"'");
	}

	return $values;
}

function readGeminiConfigValue(string $key): string
{
	$localEnv = readGeminiLocalEnv();
	if (isset($localEnv[$key]) && trim((string) $localEnv[$key]) !== '') {
		return trim((string) $localEnv[$key]);
	}

	$envValue = getenv($key);
	if ($envValue === false || trim((string) $envValue) === '') {
		return '';
	}

	return trim((string) $envValue);
}

function getGeminiApiKey(): string
{
	$apiKey = readGeminiConfigValue('GEMINI_API_KEY');
	if ($apiKey === '') {
		return '';
	}

	return $apiKey;
}

function getGeminiModel(): string
{
	$model = readGeminiConfigValue('GEMINI_MODEL');
	if ($model === '') {
		return 'gemini-2.5-flash-lite';
	}

	return $model;
}