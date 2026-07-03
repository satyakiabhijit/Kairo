import urllib3

class ConnectionPoolManager:
    """
    Implements connection pooling to prevent socket exhaustion
    during rapid async workflows.
    Resolves Issue #15.
    """
    def __init__(self, maxsize=10):
        self.pool = urllib3.PoolManager(maxsize=maxsize)
        
    def request(self, method, url, **kwargs):
        """
        Execute request using the managed connection pool.
        """
        return self.pool.request(method, url, **kwargs)
        
    def clear(self):
        """
        Clear the connection pool explicitly if needed.
        """
        self.pool.clear()

# Global instance for shared usage
pool_manager = ConnectionPoolManager()
