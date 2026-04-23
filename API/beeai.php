<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/ollama.php';

function buildOllamaMessages(array $messages, string $prompt): array
{
	$ollamaMessages = [[
		'role' => 'system',
		'content' => 'You are BeeAI. Reply in a professional, clear, concise style. Follow the user request directly without guessing unrelated context. Do not include terminal control symbols, escape sequences, or artifacts like [K, [1D, [3D.',
	]];

	foreach (array_slice($messages, -10) as $message) {
		if (!is_array($message)) {
			continue;
		}

		$role = (string) ($message['role'] ?? 'user');
		$text = trim((string) ($message['content'] ?? ''));
		if ($text === '') {
			continue;
		}

		$ollamaMessages[] = [
			'role' => $role === 'assistant' ? 'assistant' : 'user',
			'content' => $text,
		];
	}

	$prompt = trim($prompt);
	if ($prompt !== '') {
		$ollamaMessages[] = [
			'role' => 'user',
			'content' => $prompt,
		];
	}

	return $ollamaMessages;
}

function isOllamaError(?int $statusCode, array $decoded): bool
{
	if ($statusCode === 429) {
		return true;
	}

	if ($statusCode === 503) {
		return true;
	}

	$error = $decoded['error'] ?? null;
	if (is_string($error)) {
		$errorLower = strtolower($error);
		return str_contains($errorLower, 'unavailable') || str_contains($errorLower, 'timeout');
	}

	return false;
}

function isOllamaModelNotFound(array $decoded): bool
{
	$error = $decoded['error'] ?? null;
	if (!is_string($error)) {
		return false;
	}

	$error = strtolower($error);
	return str_contains($error, 'model') && str_contains($error, 'not found');
}

function isOllamaMemoryError(array $decoded): bool
{
	$error = $decoded['error'] ?? null;
	if (!is_string($error)) {
		return false;
	}

	$error = strtolower($error);
	return str_contains($error, 'requires more system memory') || str_contains($error, 'out of memory');
}

function getOllamaFallbackModel(string $currentModel): string
{
	if (strtolower($currentModel) !== 'qwen2.5:1.5b') {
		return 'qwen2.5:1.5b';
	}

	return $currentModel;
}

function runOllamaCliFallback(string $model, array $messages): ?string
{
	if (!function_exists('proc_open')) {
		return null;
	}

	$latestUserPrompt = '';
	foreach (array_slice($messages, -10) as $message) {
		$role = (string) ($message['role'] ?? 'user');
		$content = trim((string) ($message['content'] ?? ''));
		if ($content === '') {
			continue;
		}

		if ($role === 'user') {
			$latestUserPrompt = $content;
		}
	}

	$prompt = trim($latestUserPrompt);
	if ($prompt === '') {
		$prompt = 'Hello';
	}

	$prompt = "Respond professionally and directly to this user request:\n" . $prompt;

	$modelsPath = getOllamaModelsPath();
	if ($modelsPath !== '') {
		putenv('OLLAMA_MODELS=' . $modelsPath);
	}

	$command = sprintf('ollama run %s %s', escapeshellarg($model), escapeshellarg($prompt));
	$output = executeCommandWithTimeout($command, 25);
	if (!is_string($output)) {
		return null;
	}

	$output = sanitizeOllamaText($output);
	if ($output === '') {
		return null;
	}

	if (str_starts_with(strtolower($output), 'error:')) {
		return null;
	}

	return $output;
}

function executeCommandWithTimeout(string $command, int $timeoutSeconds): ?string
{
	$descriptorSpec = [
		0 => ['pipe', 'r'],
		1 => ['pipe', 'w'],
		2 => ['pipe', 'w'],
	];

	$process = @proc_open($command, $descriptorSpec, $pipes);
	if (!is_resource($process)) {
		return null;
	}

	fclose($pipes[0]);
	stream_set_blocking($pipes[1], false);
	stream_set_blocking($pipes[2], false);

	$stdout = '';
	$stderr = '';
	$start = microtime(true);

	while (true) {
		$status = proc_get_status($process);
		$stdoutChunk = stream_get_contents($pipes[1]);
		$stderrChunk = stream_get_contents($pipes[2]);

		if (is_string($stdoutChunk) && $stdoutChunk !== '') {
			$stdout .= $stdoutChunk;
		}
		if (is_string($stderrChunk) && $stderrChunk !== '') {
			$stderr .= $stderrChunk;
		}

		if (!$status['running']) {
			break;
		}

		if ((microtime(true) - $start) > $timeoutSeconds) {
			proc_terminate($process);
			break;
		}

		usleep(100000);
	}

	fclose($pipes[1]);
	fclose($pipes[2]);
	proc_close($process);

	$combined = trim($stdout . "\n" . $stderr);
	if ($combined === '') {
		return null;
	}

	return $combined;
}

function sanitizeOllamaText(string $text): string
{
	$text = preg_replace('/\x1B\[[0-9;?]*[ -\/]*[@-~]/', '', $text) ?? $text;
	$text = preg_replace('/\[[0-9;?]*[A-Za-z]/', '', $text) ?? $text;
	$text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text) ?? $text;
	$text = preg_replace('/[ \t]+/', ' ', $text) ?? $text;
	$text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;

	return trim($text);
}

try {
	if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
		jsonResponse(405, [
			'success' => false,
			'message' => 'Method not allowed',
		]);
	}

	$baseUrl = getOllamaBaseUrl();
	if ($baseUrl === '') {
		jsonResponse(500, [
			'success' => false,
			'message' => 'Ollama base URL is not configured on the server.',
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

	$ollamaMessages = buildOllamaMessages($messages, $prompt);
	
	$ollamaPayload = [
		'model' => getOllamaModel(),
		'messages' => $ollamaMessages,
		'stream' => false,
		'options' => [
			'temperature' => getOllamaTemperature(),
			'top_p' => getOllamaTopP(),
			'top_k' => getOllamaTopK(),
		],
	];

	$endpoint = $baseUrl . '/api/chat';
	$timeout = getOllamaTimeout();

	$responseHeaders = [];
	$responseBody = null;
	$statusCode = 0;

	$context = stream_context_create([
		'http' => [
			'method' => 'POST',
			'header' => "Content-Type: application/json\r\n",
			'content' => json_encode($ollamaPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
			'timeout' => $timeout,
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
		$selectedModel = getOllamaModel();
		$retryModel = getOllamaFallbackModel($selectedModel);

		if ($retryModel === $selectedModel) {
			$fallbackReply = runOllamaCliFallback($selectedModel, $ollamaMessages);
			if (is_string($fallbackReply) && $fallbackReply !== '') {
				jsonResponse(200, [
					'success' => true,
					'reply' => $fallbackReply,
					'model' => $selectedModel,
				]);
			}
		}

		if ($retryModel !== $selectedModel) {
			$fallbackReply = runOllamaCliFallback($retryModel, $ollamaMessages);
			if (is_string($fallbackReply) && $fallbackReply !== '') {
				jsonResponse(200, [
					'success' => true,
					'reply' => $fallbackReply,
					'model' => $retryModel,
				]);
			}
		}

		jsonResponse(502, [
			'success' => false,
			'message' => 'Invalid response from Ollama. Make sure Ollama is running at: ' . $baseUrl,
		]);
	}

	if ($statusCode < 200 || $statusCode >= 300) {
		if (isOllamaModelNotFound($decoded) || isOllamaMemoryError($decoded)) {
			$selectedModel = getOllamaModel();
			$retryModel = getOllamaFallbackModel($selectedModel);
			if ($retryModel === $selectedModel) {
				$fallbackReply = runOllamaCliFallback($selectedModel, $ollamaMessages);
				if (is_string($fallbackReply) && $fallbackReply !== '') {
					jsonResponse(200, [
						'success' => true,
						'reply' => $fallbackReply,
						'model' => $selectedModel,
					]);
				}
			}

			if ($retryModel !== $selectedModel) {
				$fallbackReply = runOllamaCliFallback($retryModel, $ollamaMessages);
				if (is_string($fallbackReply) && $fallbackReply !== '') {
					jsonResponse(200, [
						'success' => true,
						'reply' => $fallbackReply,
						'model' => $retryModel,
					]);
				}
			}

			if (isOllamaMemoryError($decoded)) {
				jsonResponse(503, [
					'success' => false,
					'message' => 'Selected model needs more RAM on this machine. Try qwen2.5:1.5b or another smaller model.',
				]);
			}
		}

		if (isOllamaError($statusCode, $decoded)) {
			jsonResponse(503, [
				'success' => false,
				'message' => 'Ollama is temporarily unavailable. Make sure Ollama is running.',
				'retryAfter' => 5,
			]);
		}

		jsonResponse($statusCode > 0 ? $statusCode : 502, [
			'success' => false,
			'message' => $decoded['error'] ?? 'Ollama request failed.',
		]);
	}

	$replyText = sanitizeOllamaText((string) ($decoded['message']['content'] ?? ''));

	if ($replyText === '') {
		jsonResponse(502, [
			'success' => false,
			'message' => 'Ollama returned an empty response.',
		]);
	}

	jsonResponse(200, [
		'success' => true,
		'reply' => $replyText,
		'model' => getOllamaModel(),
	]);
} catch (Throwable $e) {
	jsonResponse(500, [
		'success' => false,
		'message' => 'BeeAI service failed.',
		'error' => $e->getMessage(),
	]);
}