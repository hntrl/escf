export default `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Basic Auth Demo</title>
	<style>
		body {
			font-family: Arial, sans-serif;
			max-width: 800px;
		}
		h1, h2 {
			color: #2c3e50;
		}
		pre {
			background-color: #ecf0f1;
			padding: 10px;
			border-radius: 5px;
			overflow-x: auto;
		}
		input, button {
			padding: 8px;
			border: 1px solid #ddd;
			border-radius: 2px;
		}
		button {
			background-color: #3498db;
			color: #fff;
			border: none;
			cursor: pointer;
			transition: background-color 0.1s ease;
		}
		button:hover {
			background-color: #2980b9;
		}
	</style>
	<script>
		async function fetchUserInfo() {
			const response = await fetch('/v1/user');
			const data = await response.json();
			document.getElementById('userInfo').textContent = JSON.stringify(data, null, 2);
		}

		async function login(event) {
			event.preventDefault();
			const form = event.target;
			const response = await fetch('/v1/user/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: form.email.value,
					password: form.password.value
				})
			});
			const data = await response.json();
			alert(JSON.stringify(data));
			location.reload();
		}

		async function register(event) {
			event.preventDefault();
			const form = event.target;
			const response = await fetch('/v1/user/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					avatar: null,
					name: form.name.value,
					email: form.email.value,
					password: form.password.value
				})
			});
			const data = await response.json();
			alert(JSON.stringify(data));
			location.reload();
		}

		async function logout() {
			await fetch('/v1/user/logout', { method: 'POST' });
			location.reload();
		}

		window.onload = () => {
			fetchUserInfo();
		};
	</script>
</head>
<body>
	<h1>Basic Auth Demo</h1>

	<pre id="userInfo">Loading...</pre>

	<h2>Login</h2>
	<form onsubmit="login(event)">
		<input type="email" name="email" placeholder="Email" required>
		<input type="password" name="password" placeholder="Password" required>
		<button type="submit">Login</button>
	</form>

	<h2>Register</h2>
	<form onsubmit="register(event)">
		<input type="text" name="name" placeholder="Name" required>
		<input type="email" name="email" placeholder="Email" required>
		<input type="password" name="password" placeholder="Password" required>
		<button type="submit">Register</button>
	</form>

	<h2>Logout</h2>
	<button onclick="logout()">Logout</button>
</body>
</html>
`;
