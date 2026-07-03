import unittest
from unittest.mock import patch, MagicMock
import sys
import os

# Add parent directory to path so we can import from cli
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from logger import get_logger
from config import prompt_config
from executor import run_command
from pool import ConnectionPoolManager

class TestKairoCLI(unittest.TestCase):
    
    @patch('builtins.input', side_effect=['my_api_key', 'prod'])
    def test_prompt_config(self, mock_input):
        config = prompt_config()
        self.assertEqual(config['api_key'], 'my_api_key')
        self.assertEqual(config['environment'], 'prod')
        
    def test_run_command_safe(self):
        result = run_command([sys.executable, "-c", "print('hello')"])
        self.assertEqual(result['status'], 'success')
        
    def test_run_command_unsafe(self):
        with self.assertRaises(ValueError):
            run_command(f"{sys.executable} -c \"print('hello')\" && rm -rf /")

    @patch('urllib3.PoolManager.request')
    def test_connection_pool(self, mock_request):
        # Mock the response
        mock_response = MagicMock()
        mock_response.status = 200
        mock_request.return_value = mock_response
        
        manager = ConnectionPoolManager()
        response = manager.request('GET', 'http://test.com')
        
        self.assertEqual(response.status, 200)
        mock_request.assert_called_once_with('GET', 'http://test.com')

if __name__ == '__main__':
    unittest.main()
