import unittest

import pandas as pd

from api.pipeline_utils import compute_site_metrics


class ComputeSiteMetricsTests(unittest.TestCase):
    def test_reports_peak_and_low_monthly_yield(self):
        dates = pd.date_range("2024-01-01", "2024-02-29", freq="D")
        irradiance = [6.0 if day.month == 1 else 2.0 for day in dates]
        data = pd.DataFrame({
            "date": dates,
            "ALLSKY_SFC_SW_DWN": irradiance,
            "T2M": 20.0,
        })

        metrics = compute_site_metrics(data)

        self.assertEqual(metrics["peak_yield_month"], "January")
        self.assertEqual(metrics["lowest_yield_month"], "February")
        self.assertGreater(
            metrics["peak_monthly_yield_kwh"],
            metrics["lowest_monthly_yield_kwh"],
        )


if __name__ == "__main__":
    unittest.main()
