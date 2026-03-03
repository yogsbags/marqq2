interface CSVAnalysisResult {
  summary: string;
  insights: string[];
  recommendations: string[];
  keyMetrics: {
    totalRows: number;
    totalColumns: number;
    dataTypes: Record<string, string>;
    missingValues: Record<string, number>;
  };
  sampleData: any[];
}

interface ChatQuery {
  question: string;
  context: string;
  csvData: any[];
}

export class CSVAnalysisService {
  private static parseCSV(csvContent: string): any[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length === headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }
    
    return data;
  }

  private static analyzeDataTypes(data: any[]): Record<string, string> {
    if (data.length === 0) return {};
    
    const types: Record<string, string> = {};
    const sample = data[0];
    
    Object.keys(sample).forEach(key => {
      const values = data.slice(0, 100).map(row => row[key]).filter(v => v && v.trim());
      
      if (values.length === 0) {
        types[key] = 'empty';
        return;
      }
      
      // Check if all values are numbers
      const numericValues = values.filter(v => !isNaN(Number(v)));
      if (numericValues.length === values.length) {
        types[key] = 'number';
        return;
      }
      
      // Check if all values are dates
      const dateValues = values.filter(v => !isNaN(Date.parse(v)));
      if (dateValues.length === values.length) {
        types[key] = 'date';
        return;
      }
      
      // Check if all values are emails
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const emailValues = values.filter(v => emailRegex.test(v));
      if (emailValues.length === values.length) {
        types[key] = 'email';
        return;
      }
      
      types[key] = 'text';
    });
    
    return types;
  }

  private static calculateMissingValues(data: any[]): Record<string, number> {
    if (data.length === 0) return {};
    
    const missing: Record<string, number> = {};
    const headers = Object.keys(data[0]);
    
    headers.forEach(header => {
      const emptyCount = data.filter(row => !row[header] || row[header].trim() === '').length;
      missing[header] = emptyCount;
    });
    
    return missing;
  }

  private static generateInsights(data: any[], dataTypes: Record<string, string>): string[] {
    const insights: string[] = [];
    
    // Data quality insights
    const totalRows = data.length;
    insights.push(`Dataset contains ${totalRows.toLocaleString()} records`);
    
    // Column analysis
    const numericColumns = Object.entries(dataTypes).filter(([_, type]) => type === 'number').length;
    const textColumns = Object.entries(dataTypes).filter(([_, type]) => type === 'text').length;
    const emailColumns = Object.entries(dataTypes).filter(([_, type]) => type === 'email').length;
    
    if (numericColumns > 0) {
      insights.push(`Found ${numericColumns} numeric columns for quantitative analysis`);
    }
    
    if (emailColumns > 0) {
      insights.push(`Identified ${emailColumns} email columns for contact analysis`);
    }
    
    // Sample data insights
    if (data.length > 0) {
      const sampleRow = data[0];
      const hasCompanyData = Object.keys(sampleRow).some(key => 
        key.toLowerCase().includes('company') || key.toLowerCase().includes('organization')
      );
      
      if (hasCompanyData) {
        insights.push('Company/organization data detected - suitable for B2B analysis');
      }
      
      const hasRevenueData = Object.keys(sampleRow).some(key => 
        key.toLowerCase().includes('revenue') || key.toLowerCase().includes('sales') || key.toLowerCase().includes('amount')
      );
      
      if (hasRevenueData) {
        insights.push('Revenue/sales data found - enables ROI and performance analysis');
      }
    }
    
    return insights;
  }

  private static generateRecommendations(data: any[], dataTypes: Record<string, string>, missingValues: Record<string, number>): string[] {
    const recommendations: string[] = [];
    
    // Data quality recommendations
    const highMissingColumns = Object.entries(missingValues).filter(([_, count]) => count > data.length * 0.2);
    if (highMissingColumns.length > 0) {
      recommendations.push(`Consider data enrichment for columns with >20% missing values: ${highMissingColumns.map(([col]) => col).join(', ')}`);
    }
    
    // Analysis recommendations
    const numericColumns = Object.entries(dataTypes).filter(([_, type]) => type === 'number');
    if (numericColumns.length > 0) {
      recommendations.push('Use numeric columns for segmentation and scoring algorithms');
    }
    
    const emailColumns = Object.entries(dataTypes).filter(([_, type]) => type === 'email');
    if (emailColumns.length > 0) {
      recommendations.push('Email columns can be used for outreach campaigns and engagement tracking');
    }
    
    // Marketing specific recommendations
    if (data.length > 1000) {
      recommendations.push('Large dataset detected - ideal for AI-powered lead scoring and segmentation');
    }
    
    if (data.length > 10000) {
      recommendations.push('Consider implementing automated workflows for this large dataset');
    }
    
    return recommendations;
  }

  static async analyzeCSV(file: File): Promise<CSVAnalysisResult> {
    try {
      // Only support CSV files for now
      if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
        throw new Error('Unsupported file type. Please upload a CSV file.');
      }
      
      const data = await new Promise<any[]>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          try {
            const csvContent = e.target?.result as string;
            const parsedData = this.parseCSV(csvContent);
            resolve(parsedData);
          } catch (error) {
            reject(error);
          }
        };
        
        reader.onerror = () => {
          reject(new Error('Failed to read CSV file'));
        };
        
        reader.readAsText(file);
      });
      
      if (data.length === 0) {
        throw new Error('No valid data found in file');
      }
      
      const dataTypes = this.analyzeDataTypes(data);
      const missingValues = this.calculateMissingValues(data);
      const insights = this.generateInsights(data, dataTypes);
      const recommendations = this.generateRecommendations(data, dataTypes, missingValues);
      
      const result: CSVAnalysisResult = {
        summary: `Analyzed ${data.length} rows and ${Object.keys(data[0]).length} columns. Data quality score: ${Math.round((1 - Object.values(missingValues).reduce((a, b) => a + b, 0) / (data.length * Object.keys(data[0]).length)) * 100)}%`,
        insights,
        recommendations,
        keyMetrics: {
          totalRows: data.length,
          totalColumns: Object.keys(data[0]).length,
          dataTypes,
          missingValues
        },
        sampleData: data.slice(0, 5) // First 5 rows as sample
      };
      
      return result;
    } catch (error) {
      throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async queryChatData(query: ChatQuery): Promise<string> {
    // Simulate AI-powered querying of CSV data
    const { question, csvData } = query;
    
    // Simple query processing (in a real implementation, this would use an LLM)
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('total') || lowerQuestion.includes('count')) {
      return `The dataset contains ${csvData.length} total records.`;
    }
    
    if (lowerQuestion.includes('column') || lowerQuestion.includes('field')) {
      const columns = csvData.length > 0 ? Object.keys(csvData[0]) : [];
      return `The dataset has ${columns.length} columns: ${columns.join(', ')}`;
    }
    
    if (lowerQuestion.includes('sample') || lowerQuestion.includes('example')) {
      const sample = csvData.slice(0, 3);
      return `Here are the first 3 records:\n${JSON.stringify(sample, null, 2)}`;
    }
    
    if (lowerQuestion.includes('missing') || lowerQuestion.includes('empty')) {
      const missingValues = this.calculateMissingValues(csvData);
      const totalMissing = Object.values(missingValues).reduce((a, b) => a + b, 0);
      return `Found ${totalMissing} missing values across all columns.`;
    }
    
    // Default response
    return `I can help you analyze this dataset with ${csvData.length} records. Try asking about totals, columns, samples, or missing data.`;
  }
}