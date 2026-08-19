const messagePromise = fetch("/welcome-message").then((response) => response.text())
const minimumLoadingTime = new Promise((resolve) => setTimeout(resolve, 1500))

const [message] = await Promise.all([messagePromise, minimumLoadingTime])
document.querySelector("#welcomeMessage").innerText = message
