import httpx

API = "https://api.github.com"


class GitHubError(Exception):
    def __init__(self, status: int, msg: str):
        self.status, self.msg = status, msg


class GitHub:
    def __init__(self, token: str = ""):
        self.h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "CONDUIT-Engine"}
        if token:
            self.h["Authorization"] = f"Bearer {token}"

    async def _req(self, method: str, path: str, **kw):
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.request(method, API + path, headers=self.h, **kw)
        if r.status_code >= 400:
            raise GitHubError(r.status_code, "GitHub request failed")  # never echo upstream bodies
        return r.json()

    async def me(self): return await self._req("GET", "/user")
    async def repos(self, page=1):
        return await self._req("GET", "/user/repos", params={"per_page": 30, "page": page, "sort": "updated"})
    async def repo(self, o, r): return await self._req("GET", f"/repos/{o}/{r}")
    async def branches(self, o, r): return await self._req("GET", f"/repos/{o}/{r}/branches", params={"per_page": 100})
    async def branch_sha(self, o, r, b): return (await self._req("GET", f"/repos/{o}/{r}/branches/{b}"))["commit"]["sha"]
    async def create_pr(self, o, r, head, base, title, body):
        return await self._req("POST", f"/repos/{o}/{r}/pulls", json={"head": head, "base": base, "title": title, "body": body})
