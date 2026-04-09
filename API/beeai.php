<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/gemini.php';

function buildBeeAiContents(array $messages, string $prompt): array
{
	$contents = [];

	foreach (array_slice($messages, -10) as $message) {
		if (!is_array($message)) {
			continue;
		}

		$role = (string) ($message['role'] ?? 'user');
		$text = trim((string) ($message['content'] ?? ''));
		if ($text === '') {
			continue;
		}

		$contents[] = [
			'role' => $role === 'assistant' ? 'model' : 'user',
			'parts' => [[ 'text' => $text ]],
		];
	}

	$prompt = trim($prompt);
	if ($prompt !== '') {
		$contents[] = [
			'role' => 'user',
			'parts' => [[ 'text' => $prompt ]],
		];
	}

	return $contents;
}

function isGeminiQuotaError(?int $statusCode, array $decoded): bool
{
	if ($statusCode === 429) {
		return true;
	}

	$error = $decoded['error'] ?? null;
	if (!is_array($error)) {
		return false;
	}

	$code = strtoupper((string) ($error['status'] ?? ''));
	$message = strtoupper((string) ($error['message'] ?? ''));

	return str_contains($code, 'RESOURCE_EXHAUSTED')
		|| str_contains($code, 'QUOTA')
		|| str_contains($message, 'QUOTA')
		|| str_contains($message, 'RATE LIMIT')
		|| str_contains($message, 'RESOURCE EXHAUSTED');
}

try {
	if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
		jsonResponse(405, [
			'success' => false,
			'message' => 'Method not allowed',
		]);
	}

	$apiKey = getGeminiApiKey();
	if ($apiKey === '') {
		jsonResponse(500, [
			'success' => false,
			'message' => 'Gemini API key is not configured on the server.',
		]);
	}

	$payload = readJsonBody();
	$prompt = trim((string) ($payload['prompt'] ?? ''));
	$messages = is_array($payload['messages'] ?? null) ? $payload['messages'] : [];

	if ($prompt === '') {
		jsonResponse(400, [
			'success' => false,
			'message' => 'Prompt is required.',
		]);
	}

	$geminiPayload = [
		'contents' => buildBeeAiContents($messages, $prompt),
		'generationConfig' => [
			'temperature' => 0.7,
			'topP' => 0.95,
			'maxOutputTokens' => 1024,
		],
	];

	$model = getGeminiModel();
	$endpoint = sprintf(
		'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s',
		rawurlencode($model),
		rawurlencode($apiKey)
	);

	$responseHeaders = [];
	$responseBody = null;
	$statusCode = 0;

	$context = stream_context_create([
		'http' => [
			'method' => 'POST',
			'header' => "Content-Type: application/json\r\n",
			'content' => json_encode($geminiPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
			'timeout' => 30,
			'ignore_errors' => true,
		],
	]);

	$responseBody = @file_get_contents($endpoint, false, $context);
	$responseHeaders = $http_response_header ?? [];

	if (!empty($responseHeaders[0]) && preg_match('/HTTP\/\S+\s+(\d{3})/', $responseHeaders[0], $matches)) {
		$statusCode = (int) $matches[1];
	}

	$decoded = is_string($responseBody) && $responseBody !== '' ? json_decode($responseBody, true) : null;
	if (!is_array($decoded)) {
		jsonResponse(502, [
			'success' => false,
			'message' => 'Invalid response from Gemini.',
		]);
	}

	if ($statusCode < 200 || $statusCode >= 300) {
		if (isGeminiQuotaError($statusCode, $decoded)) {
			jsonResponse(429, [
				'success' => false,
				'message' => 'BeeAI is temporarily rate-limited. Please wait a moment and try again.',
				'retryAfter' => 30,
			]);
		}

		jsonResponse($statusCode > 0 ? $statusCode : 502, [
			'success' => false,
			'message' => $decoded['error']['message'] ?? 'BeeAI request failed.',
		]);
	}

	$replyText = trim((string) implode('', array_filter(array_map(
		static fn($part) => is_array($part) ? (string) ($part['text'] ?? '') : '',
		$decoded['candidates'][0]['content']['parts'] ?? []
	))));

	if ($replyText === '') {
		jsonResponse(502, [
			'success' => false,
			'message' => 'BeeAI returned an empty response.',
		]);
	}

	jsonResponse(200, [
		'success' => true,
		'reply' => $replyText,
		'model' => $model,
	]);
} catch (Throwable $e) {
	jsonResponse(500, [
		'success' => false,
		'message' => 'BeeAI service failed.',
		'error' => $e->getMessage(),
	]);
}