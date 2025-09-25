const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const XLSX = require('xlsx');

// 可选依赖 - 如果安装失败也不影响基本功能
let OpenAI, axios, natural;

try {
    OpenAI = require('openai');
    axios = require('axios');
    natural = require('natural');
    console.log('✅ 联表分析功能可用');
} catch (e) {
    console.log('⚠️  联表分析功能不可用（使用基础分析功能）');
}

console.log('📊 系统已启动 - 专注轻量级核心分析功能，无Canvas依赖');

const app = express();
const PORT = process.env.PORT || 3001;

// AI配置 (可通过环境变量设置)
const AI_CONFIG = {
  openai: {
    client: process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    }) : null,
    model: 'gpt-3.5-turbo'
  },
  // 支持其他AI服务
  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
    endpoint: 'https://api.anthropic.com/v1/messages'
  },
  qianfan: {
    apiKey: process.env.QIANFAN_API_KEY,
    endpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions'
  }
};

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Favicon路由 - 返回一个简单的SVG图标
app.get('/favicon.ico', (req, res) => {
  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#667eea"/>
    <text x="50" y="60" font-family="Arial, sans-serif" font-size="50" text-anchor="middle" fill="white">📊</text>
  </svg>`;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.send(svgIcon);
});

// 提供格式指南和示例文件
app.get('/DATA_FORMAT_GUIDE.md', (req, res) => {
  res.sendFile(path.join(__dirname, 'DATA_FORMAT_GUIDE.md'));
});

app.get('/sample-multi-class.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('多班级成绩示例.csv')}`);
  res.sendFile(path.join(__dirname, 'sample-multi-class.csv'));
});

app.get('/sample-single-class.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('单班级成绩示例.csv')}`);
  res.sendFile(path.join(__dirname, 'sample-single-class.csv'));
});

app.get('/sample-with-rankings.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('带排名成绩示例.csv')}`);
  res.sendFile(path.join(__dirname, 'sample-with-rankings.csv'));
});

app.get('/sample-single-class-with-rankings.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('单班级带排名示例.csv')}`);
  res.sendFile(path.join(__dirname, 'sample-single-class-with-rankings.csv'));
});

// 文件上传配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads';
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(xlsx|xls|csv)$/i;
    const extname = allowedTypes.test(file.originalname);
    
    // 更宽松的MIME类型检查
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'text/plain'
    ];
    
    if (extname || allowedMimes.includes(file.mimetype)) {
      return cb(null, true);
    } else {
      cb(new Error('只支持 Excel (.xlsx, .xls) 和 CSV 文件格式'));
    }
  }
});

// 存储分析数据
let analysisData = {
  students: [],
  subjects: [],
  classes: [],
  statistics: {}
};

// 路由

// 主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 文件上传
app.post('/upload', upload.single('gradeFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择文件' });
    }

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // 处理上传的成绩数据
    const processedData = processGradeData(jsonData);
    console.log('🔍 Debug上传 - processedData结构:', Object.keys(processedData));
    console.log('🔍 Debug上传 - 第一个学生结构:', processedData.students[0] ? Object.keys(processedData.students[0]) : '无学生');
    console.log('🔍 Debug上传 - 第一个学生数据:', processedData.students[0] || '无');
    
    analysisData = processedData;
    global.lastAnalysisData = processedData; // 同步到global变量用于导出功能

    // 检查是否有自动计算的排名
    const hasAutoCalculatedRankings = processedData.students.some(student => 
      Object.keys(student.originalRankings || {}).length > 0
    );
    
    res.json({
      success: true,
      message: hasAutoCalculatedRankings ? 
        '文件上传成功，系统已自动计算排名信息' : 
        '文件上传成功',
      data: {
        studentCount: processedData.students.length,
        subjectCount: processedData.subjects.length,
        classCount: processedData.classes.length,
        hasAutoCalculatedRankings: hasAutoCalculatedRankings
      }
    });

    // 清理上传的文件
    fs.unlink(filePath, (err) => {
      if (err) console.log('清理临时文件失败:', err);
    });

  } catch (error) {
    console.error('文件处理错误:', error);
    res.status(500).json({ error: '文件处理失败' });
  }
});

// 获取分析数据
app.get('/analysis', (req, res) => {
  if (analysisData.students.length === 0) {
    return res.status(400).json({ error: '请先上传成绩文件' });
  }

  const analysis = generateAnalysis(analysisData);
  res.json(analysis);
});

// 获取个人分析数据
app.get('/personal-analysis/:studentId', (req, res) => {
  try {
    if (analysisData.students.length === 0) {
      return res.status(400).json({ error: '请先上传成绩文件' });
    }

    const studentId = req.params.studentId;
    const personalAnalysis = generatePersonalAnalysis(analysisData, studentId);
    
    if (!personalAnalysis) {
      return res.status(404).json({ error: '学生不存在' });
    }

    res.json(personalAnalysis);
  } catch (error) {
    console.error('个人分析错误:', error);
    res.status(500).json({ error: '个人分析失败' });
  }
});

// 获取班级分析数据
app.get('/class-analysis/:className', (req, res) => {
  try {
    if (analysisData.students.length === 0) {
      return res.status(400).json({ error: '请先上传成绩文件' });
    }

    const className = req.params.className;
    const classAnalysis = generateClassAnalysis(analysisData, className);
    
    if (!classAnalysis) {
      return res.status(404).json({ error: '班级不存在' });
    }

    res.json(classAnalysis);
  } catch (error) {
    console.error('班级分析错误:', error);
    res.status(500).json({ error: '班级分析失败' });
  }
});

// 获取学生列表
app.get('/students', (req, res) => {
  if (analysisData.students.length === 0) {
    return res.status(400).json({ error: '请先上传成绩文件' });
  }

  const students = analysisData.students.map(student => ({
    id: student.id,
    name: student.name,
    class: student.class,
    totalScore: calculateTotalScore(student.grades),
    averageScore: calculateAverageScore(student.grades)
  }));

  res.json(students);
});

// AI分析接口
app.post('/ai-analysis', async (req, res) => {
  try {
    if (analysisData.students.length === 0) {
      return res.status(400).json({ error: '请先上传成绩文件' });
    }

    const { prompt, aiProvider = 'openai' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: '请提供分析需求' });
    }

    const aiAnalysis = await performAIAnalysis(analysisData, prompt, aiProvider);
    res.json(aiAnalysis);
  } catch (error) {
    console.error('AI分析错误:', error);
    res.status(500).json({ error: error.message || 'AI分析失败' });
  }
});

// 获取AI分析建议
app.get('/ai-suggestions', async (req, res) => {
  try {
    if (analysisData.students.length === 0) {
      return res.status(400).json({ error: '请先上传成绩文件' });
    }

    const suggestions = await generateAISuggestions(analysisData);
    res.json(suggestions);
  } catch (error) {
    console.error('AI建议生成错误:', error);
    res.status(500).json({ error: 'AI建议生成失败' });
  }
});

// 导出分析数据 (替代PDF下载)
app.get('/export-data', async (req, res) => {
  try {
    const currentData = global.lastAnalysisData;
    console.log('🔍 Debug班级导出 - currentData存在:', !!currentData);
    console.log('🔍 Debug班级导出 - 学生数量:', currentData && currentData.students ? currentData.students.length : 0);
    
    if (!currentData || !currentData.students || currentData.students.length === 0) {
      return res.status(400).json({ error: '请先上传成绩文件并进行分析' });
    }

    // 导出CSV格式的分析结果
    let csvContent = '\uFEFF'; // BOM for UTF-8
    csvContent += '学生姓名,总分,排名';
    
    // 添加各科目标题
    currentData.subjects.forEach(subject => {
      csvContent += `,${subject}`;
    });
    csvContent += '\n';
    
    // 添加学生数据
    currentData.students.forEach(student => {
      csvContent += `${student.name},${student.total},${student.rank}`;
      currentData.subjects.forEach(subject => {
        csvContent += `,${student.grades[subject] || '缺考'}`;
      });
      csvContent += '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('成绩分析结果.csv')}`);
    res.send(csvContent);
  } catch (error) {
    console.error('数据导出错误:', error);
    res.status(500).json({ error: '数据导出失败: ' + error.message });
  }
});

// 导出个人分析数据
app.post('/export-personal-data', async (req, res) => {
  try {
    const currentData = global.lastAnalysisData;
    console.log('🔍 Debug - currentData存在:', !!currentData);
    console.log('🔍 Debug - currentData.students存在:', !!(currentData && currentData.students));
    console.log('🔍 Debug - 学生数量:', currentData && currentData.students ? currentData.students.length : 0);
    
    if (!currentData || !currentData.students || currentData.students.length === 0) {
      return res.status(400).json({ error: '请先上传成绩文件并进行分析' });
    }

    const { studentId } = req.body;
    console.log('🔍 Debug - 请求的studentId:', studentId);
    
    if (!studentId) {
      return res.status(400).json({ error: '请选择学生' });
    }

    const student = currentData.students.find(s => s.id.toString() === studentId.toString());
    console.log('🔍 Debug - 找到的学生:', student ? student.name : '未找到');
    console.log('🔍 Debug - 学生数据结构:', student ? Object.keys(student) : '无');
    
    if (!student) {
      return res.status(404).json({ error: '学生不存在' });
    }

    // 导出学生个人数据为CSV格式
    let csvContent = '\uFEFF'; // BOM for UTF-8
    csvContent += `学生个人成绩分析报告\n`;
    csvContent += `学生姓名,${student.name}\n`;
    csvContent += `总分,${student.total}\n`;
    csvContent += `班级排名,第${student.rank}名\n`;
    csvContent += `班级,${student.class || '未知班级'}\n`;
    csvContent += `导出时间,${new Date().toLocaleString('zh-CN')}\n\n`;
    
    csvContent += `科目,成绩\n`;
    currentData.subjects.forEach(subject => {
      csvContent += `${subject},${student.grades[subject] || '缺考'}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(student.name + '_个人成绩分析.csv')}`);
    res.send(csvContent);
  } catch (error) {
    console.error('个人数据导出错误:', error);
    res.status(500).json({ error: '个人数据导出失败: ' + error.message });
  }
});

// PDF功能已完全移除，使用数据导出功能替代

// 联表分析
app.post('/joint-analysis', (req, res) => {
  try {
    const { analysisType, subjects, classes } = req.body;
    
    if (analysisData.students.length === 0) {
      return res.status(400).json({ error: '请先上传成绩文件' });
    }

    const jointAnalysis = performJointAnalysis(analysisData, analysisType, subjects, classes);
    res.json(jointAnalysis);
  } catch (error) {
    console.error('联表分析错误:', error);
    res.status(500).json({ error: '联表分析失败' });
  }
});

// 辅助函数

// 智能识别表格结构
function analyzeTableStructure(rawData) {
  if (!rawData || rawData.length === 0) return null;
  
  const headers = Object.keys(rawData[0]);
  const analysis = {
    identifiedFields: {
      studentId: null,
      studentName: null,
      className: null,
      subjects: [],
      rankings: [],
      otherFields: []
    },
    tableType: 'unknown',
    confidence: 0
  };

  // 智能识别字段
  headers.forEach(header => {
    const lowerHeader = header.toLowerCase();
    
    // 学号字段识别
    if (['学号', 'id', 'student_id', 'studentid', '编号', '考号', '准考证', 'exam_id', '学生编号'].some(pattern => 
        lowerHeader.includes(pattern.toLowerCase()))) {
      analysis.identifiedFields.studentId = header;
    }
    
    // 姓名字段识别
    else if (['姓名', 'name', 'student_name', 'studentname', '学生姓名', '学生'].some(pattern => 
        lowerHeader.includes(pattern.toLowerCase()))) {
      analysis.identifiedFields.studentName = header;
    }
    
    // 班级字段识别 - 排除排名字段
    else if (['班级', 'class', '所在班级'].some(pattern => 
        lowerHeader.includes(pattern.toLowerCase())) &&
        !lowerHeader.includes('排名') && !lowerHeader.includes('rank')) {
      analysis.identifiedFields.className = header;
    }
    // 排名字段识别 - 增强模式匹配
    else if (['排名', 'rank', 'ranking', '名次', '位次'].some(pattern => 
        lowerHeader.includes(pattern.toLowerCase()))) {
      analysis.identifiedFields.rankings.push(header);
    }
    
    // 科目字段识别（包含数字的可能是成绩）
    else {
      const hasNumericData = rawData.slice(0, 5).some(row => {
        const value = row[header];
        return !isNaN(parseFloat(value)) && value !== '';
      });
      
      if (hasNumericData) {
        // 进一步检查是否是成绩字段（排除学号等标识字段）
        const isScoreField = checkIfScoreField(header, rawData);
        if (isScoreField) {
          analysis.identifiedFields.subjects.push(header);
        } else {
          analysis.identifiedFields.otherFields.push(header);
        }
      } else {
        analysis.identifiedFields.otherFields.push(header);
      }
    }
  });

  // 判断表格类型
  if (analysis.identifiedFields.subjects.length > 1) {
    analysis.tableType = 'multi-subject';
    analysis.confidence = 0.9;
  } else if (analysis.identifiedFields.subjects.length === 1) {
    analysis.tableType = 'single-subject';
    analysis.confidence = 0.8;
  }

  return analysis;
}

// 检查是否为成绩字段的函数
function checkIfScoreField(header, rawData) {
  const lowerHeader = header.toLowerCase();
  
  // 排除明显的非成绩字段
  const excludePatterns = [
    '学号', 'id', 'student_id', 'studentid', '编号', 'number', 'no',
    '姓名', 'name', 'student_name', 'studentname', '学生姓名', '学生',
    '班级', 'class', 'grade', '年级', '所在班级', 'classname',
    '序号', 'index', '排名', 'rank', 'ranking', '名次',
    '学校', 'school', '院系', 'department', '专业', 'major',
    '性别', 'gender', 'sex', '年龄', 'age', '出生', 'birth',
    '电话', 'phone', 'tel', '手机', 'mobile', '联系', 'contact',
    '地址', 'address', '邮箱', 'email', 'mail',
    '考号', '准考证', 'ticket', 'exam_id', '考试编号'
  ];
  
  // 如果字段名包含排除模式，则不是成绩字段
  const isExcluded = excludePatterns.some(pattern => 
    lowerHeader.includes(pattern.toLowerCase())
  );
  
  if (isExcluded) {
    return false;
  }
  
  // 检查数值范围，成绩通常在0-100或0-150之间
  const numericValues = rawData.slice(0, 10).map(row => {
    const value = parseFloat(row[header]);
    return isNaN(value) ? null : value;
  }).filter(v => v !== null);
  
  if (numericValues.length === 0) {
    return false;
  }
  
  const maxValue = Math.max(...numericValues);
  const minValue = Math.min(...numericValues);
  
  // 如果最大值超过1000或最小值为负数，可能不是成绩
  if (maxValue > 1000 || minValue < 0) {
    return false;
  }
  
  // 如果所有值都相同且很大（如学号），不是成绩
  if (maxValue === minValue && maxValue > 200) {
    return false;
  }
  
  // 如果数值长度超过4位且都相似（如学号），不是成绩
  const avgValue = numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length;
  if (avgValue > 1000 && numericValues.every(v => v.toString().length >= 4)) {
    return false;
  }
  
  // 检查是否是常见的科目名称
  const subjectPatterns = [
    '语文', 'chinese', '数学', 'math', 'mathematics', '英语', 'english',
    '物理', 'physics', '化学', 'chemistry', '生物', 'biology',
    '历史', 'history', '地理', 'geography', '政治', 'politics',
    '科学', 'science', '文科', 'liberal', '理科', 'science'
  ];
  
  // 排除总分等汇总字段
  const excludeTotalPatterns = [
    '总分', 'total', '平均', 'average', 'avg', '合计', 'sum', '总计'
  ];
  
  const isTotalExcluded = excludeTotalPatterns.some(pattern => 
    lowerHeader.includes(pattern.toLowerCase())
  );
  
  // 如果是应该排除的字段（如总分），返回false
  if (isTotalExcluded) {
    return false;
  }
  
  const isSubject = subjectPatterns.some(pattern => 
    lowerHeader.includes(pattern.toLowerCase())
  );
  
  // 如果是明确的科目名称，返回true
  if (isSubject) {
    return true;
  }
  
  // 其他情况，如果数值合理且不被排除，认为是成绩
  return maxValue <= 200 && minValue >= 0 && avgValue <= 150;
}

// 自动计算排名信息
function calculateRankings(students, subjects) {
  console.log('🔍 开始自动计算排名信息...');
  
  // 按班级分组
  const classGroups = {};
  students.forEach(student => {
    if (!classGroups[student.class]) {
      classGroups[student.class] = [];
    }
    classGroups[student.class].push(student);
  });
  
  // 为每个学生计算排名
  students.forEach(student => {
    // 如果已经有排名信息，跳过自动计算
    if (Object.keys(student.rankings).length > 0) {
      console.log(`🔍 学生 ${student.name} 已有排名信息，跳过自动计算`);
      return;
    }
    
    // 初始化排名对象
    student.rankings = {};
    student.originalRankings = {}; // 用于存储详细排名信息
    
    // 计算总分排名
    const classStudents = classGroups[student.class] || [];
    const allStudents = students;
    
    // 按总分排序
    const classSortedByTotal = [...classStudents].sort((a, b) => b.total - a.total);
    const allSortedByTotal = [...allStudents].sort((a, b) => b.total - a.total);
    
    // 总分排名
    const classTotalRank = classSortedByTotal.findIndex(s => s.id === student.id) + 1;
    const allTotalRank = allSortedByTotal.findIndex(s => s.id === student.id) + 1;
    
    student.rankings[`总分班级排名共${classStudents.length}人`] = classTotalRank;
    student.rankings[`总分年级排名共${allStudents.length}人`] = allTotalRank;
    student.originalRankings[`总分班级排名共${classStudents.length}人`] = classTotalRank;
    student.originalRankings[`总分年级排名共${allStudents.length}人`] = allTotalRank;
    
    // 计算各科目排名
    subjects.forEach(subject => {
      if (student.grades[subject] !== undefined) {
        // 按该科目成绩排序
        const classSortedBySubject = [...classStudents].sort((a, b) => 
          (b.grades[subject] || 0) - (a.grades[subject] || 0)
        );
        const allSortedBySubject = [...allStudents].sort((a, b) => 
          (b.grades[subject] || 0) - (a.grades[subject] || 0)
        );
        
        const classSubjectRank = classSortedBySubject.findIndex(s => s.id === student.id) + 1;
        const allSubjectRank = allSortedBySubject.findIndex(s => s.id === student.id) + 1;
        
        student.rankings[`${subject}班级排名共${classStudents.length}人`] = classSubjectRank;
        student.rankings[`${subject}年级排名共${allStudents.length}人`] = allSubjectRank;
        student.originalRankings[`${subject}班级排名共${classStudents.length}人`] = classSubjectRank;
        student.originalRankings[`${subject}年级排名共${allStudents.length}人`] = allSubjectRank;
      }
    });
    
    console.log(`🔍 学生 ${student.name} 排名计算完成:`, {
      总分班级排名: classTotalRank,
      总分年级排名: allTotalRank,
      科目数量: subjects.length
    });
  });
  
  console.log('✅ 排名计算完成');
  return students;
}

function processGradeData(rawData) {
  const tableAnalysis = analyzeTableStructure(rawData);
  
  if (!tableAnalysis) {
    throw new Error('无法解析表格数据');
  }

  const students = [];
  const subjects = new Set();
  const classes = new Set();

  rawData.forEach((row, index) => {
    const student = {
      id: row[tableAnalysis.identifiedFields.studentId] || 
          row['学号'] || row['ID'] || (index + 1),
      name: row[tableAnalysis.identifiedFields.studentName] || 
            row['姓名'] || row['学生姓名'] || `学生${index + 1}`,
      class: row[tableAnalysis.identifiedFields.className] || 
             row['班级'] || row['所在班级'] || '高一年级',
      grades: {},
      rankings: {}
    };

    // 处理科目成绩
    tableAnalysis.identifiedFields.subjects.forEach(subject => {
      const score = parseFloat(row[subject]);
      if (!isNaN(score)) {
        // 清理科目名称
        const cleanSubjectName = cleanSubjectName_func(subject);
        student.grades[cleanSubjectName] = score;
        subjects.add(cleanSubjectName);
      }
    });

    // 处理排名信息
    tableAnalysis.identifiedFields.rankings.forEach(rankField => {
      const rank = parseInt(row[rankField]);
      if (!isNaN(rank)) {
        student.rankings[rankField] = rank;
      }
    });

    classes.add(student.class);
    students.push(student);
  });

  // 计算总分和排名
  students.forEach(student => {
    // 计算总分
    const scores = Object.values(student.grades).filter(score => !isNaN(score));
    student.total = scores.reduce((sum, score) => sum + score, 0);
  });

  // 自动计算排名信息
  const enhancedStudents = calculateRankings(students, Array.from(subjects));

  // 按总分排序并分配排名
  enhancedStudents.sort((a, b) => b.total - a.total);
  enhancedStudents.forEach((student, index) => {
    student.rank = index + 1;
  });

  const result = {
    students: enhancedStudents,
    subjects: Array.from(subjects),
    classes: Array.from(classes),
    rankings: tableAnalysis.identifiedFields.rankings,
    statistics: calculateStatistics(enhancedStudents, Array.from(subjects)),
    tableAnalysis,
    chartRecommendations: generateChartRecommendations(tableAnalysis, Array.from(subjects))
  };

  return result;
}

// 生成图表推荐
function generateChartRecommendations(tableAnalysis, subjects) {
  const recommendations = [];
  
  if (tableAnalysis.tableType === 'multi-subject') {
    recommendations.push({
      type: 'bar',
      title: '各科目平均分对比',
      description: '显示所有科目的平均成绩',
      priority: 'high'
    });
    
    recommendations.push({
      type: 'radar',
      title: '科目成绩雷达图',
      description: '多维度展示各科目成绩分布',
      priority: 'high'
    });
    
    recommendations.push({
      type: 'heatmap',
      title: '成绩热力图',
      description: '可视化各班级各科目的成绩表现',
      priority: 'medium'
    });
    
    if (subjects.length >= 2) {
      recommendations.push({
        type: 'scatter',
        title: '科目相关性分析',
        description: '分析不同科目之间的相关关系',
        priority: 'medium'
      });
    }
  } else if (tableAnalysis.tableType === 'single-subject') {
    recommendations.push({
      type: 'histogram',
      title: '成绩分布直方图',
      description: '显示成绩的分布情况',
      priority: 'high'
    });
    
    recommendations.push({
      type: 'box',
      title: '成绩箱线图',
      description: '显示成绩的统计特征（中位数、四分位数等）',
      priority: 'medium'
    });
  }
  
  recommendations.push({
    type: 'pie',
    title: '及格率统计',
    description: '显示及格与不及格学生的比例',
    priority: 'medium'
  });

  return recommendations;
}

function calculateStatistics(students, subjects) {
  const stats = {
    bySubject: {},
    byClass: {},
    overall: {}
  };

  // 按科目统计
  subjects.forEach(subject => {
    const scores = students
      .map(s => s.grades[subject])
      .filter(score => score !== undefined);
    
    if (scores.length > 0) {
      stats.bySubject[subject] = {
        average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
        max: Math.max(...scores),
        min: Math.min(...scores),
        count: scores.length,
        passRate: scores.filter(score => score >= 60).length / scores.length * 100
      };
    }
  });

  // 按班级统计
  const classesList = [...new Set(students.map(s => s.class))];
  classesList.forEach(className => {
    const classStudents = students.filter(s => s.class === className);
    stats.byClass[className] = {
      studentCount: classStudents.length,
      subjects: {}
    };

    subjects.forEach(subject => {
      const scores = classStudents
        .map(s => s.grades[subject])
        .filter(score => score !== undefined);
      
      if (scores.length > 0) {
        stats.byClass[className].subjects[subject] = {
          average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
          max: Math.max(...scores),
          min: Math.min(...scores),
          passRate: scores.filter(score => score >= 60).length / scores.length * 100
        };
      }
    });
  });

  return stats;
}

function generateAnalysis(data) {
  return {
    summary: {
      totalStudents: data.students.length,
      totalSubjects: data.subjects.length,
      totalClasses: data.classes.length
    },
    subjectAnalysis: data.statistics.bySubject,
    classAnalysis: data.statistics.byClass,
    charts: generateChartData(data),
    data: data.students // 添加原始学生数据
  };
}

function generateChartData(data) {
  const charts = {
    subjectAverage: {
      labels: data.subjects,
      data: data.subjects.map(subject => 
        data.statistics.bySubject[subject]?.average || 0
      )
    },
    classComparison: {
      labels: data.classes,
      datasets: data.subjects.map((subject, index) => ({
        label: subject,
        data: data.classes.map(className => 
          data.statistics.byClass[className]?.subjects[subject]?.average || 0
        ),
        backgroundColor: `hsl(${index * 360 / data.subjects.length}, 70%, 60%)`
      }))
    },
    passRateBySubject: {
      labels: data.subjects,
      data: data.subjects.map(subject => 
        data.statistics.bySubject[subject]?.passRate || 0
      )
    }
  };

  return charts;
}

function performJointAnalysis(data, analysisType, subjects, classes) {
  // 联表分析逻辑
  const results = {
    type: analysisType,
    correlations: {},
    comparisons: {},
    trends: {}
  };

  if (analysisType === 'correlation' && subjects.length >= 2) {
    // 科目相关性分析
    for (let i = 0; i < subjects.length; i++) {
      for (let j = i + 1; j < subjects.length; j++) {
        const subject1 = subjects[i];
        const subject2 = subjects[j];
        const correlation = calculateCorrelation(data.students, subject1, subject2);
        results.correlations[`${subject1}-${subject2}`] = correlation;
      }
    }
  }

  if (analysisType === 'comparison' && classes.length >= 2) {
    // 班级对比分析
    classes.forEach(className => {
      results.comparisons[className] = {};
      subjects.forEach(subject => {
        const classData = data.statistics.byClass[className]?.subjects[subject];
        if (classData) {
          results.comparisons[className][subject] = classData;
        }
      });
    });
  }

  return results;
}

function calculateCorrelation(students, subject1, subject2) {
  const pairs = students
    .filter(s => s.grades[subject1] !== undefined && s.grades[subject2] !== undefined)
    .map(s => [s.grades[subject1], s.grades[subject2]]);

  if (pairs.length < 2) return 0;

  const n = pairs.length;
  const sum1 = pairs.reduce((sum, pair) => sum + pair[0], 0);
  const sum2 = pairs.reduce((sum, pair) => sum + pair[1], 0);
  const sum1Sq = pairs.reduce((sum, pair) => sum + pair[0] * pair[0], 0);
  const sum2Sq = pairs.reduce((sum, pair) => sum + pair[1] * pair[1], 0);
  const pSum = pairs.reduce((sum, pair) => sum + pair[0] * pair[1], 0);

  const numerator = pSum - (sum1 * sum2 / n);
  const denominator = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));

  return denominator === 0 ? 0 : numerator / denominator;
}

// AI分析核心函数
async function performAIAnalysis(data, prompt, aiProvider = 'openai') {
  try {
    const context = prepareDataContext(data);
    const fullPrompt = `
基于以下成绩数据，请进行分析：

数据概述：
- 学生总数：${data.students.length}
- 科目总数：${data.subjects.length}
- 班级总数：${data.classes.length}
- 表格类型：${data.tableAnalysis?.tableType || '未知'}

科目统计：
${data.subjects.map(subject => {
  const stats = data.statistics.bySubject[subject];
  return `${subject}: 平均分${stats?.average.toFixed(2)}, 最高分${stats?.max}, 最低分${stats?.min}, 及格率${stats?.passRate.toFixed(1)}%`;
}).join('\n')}

用户需求：${prompt}

请提供详细的分析结果，包括：
1. 数据解读
2. 关键发现
3. 教学建议
4. 改进方案
`;

    let result;
    
    if (aiProvider === 'openai' && AI_CONFIG.openai.client) {
      result = await callOpenAI(fullPrompt);
    } else if (aiProvider === 'claude' && AI_CONFIG.claude.apiKey) {
      result = await callClaude(fullPrompt);
    } else if (aiProvider === 'qianfan' && AI_CONFIG.qianfan.apiKey) {
      result = await callQianfan(fullPrompt);
    } else {
      // 降级到本地分析
      result = await performLocalAnalysis(data, prompt);
    }

    return {
      success: true,
      analysis: result,
      provider: aiProvider,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('AI分析错误:', error);
    throw new Error(`AI分析失败: ${error.message}`);
  }
}

// OpenAI调用
async function callOpenAI(prompt) {
  if (!AI_CONFIG.openai.client) {
    throw new Error('OpenAI API未配置');
  }
  
  const response = await AI_CONFIG.openai.client.chat.completions.create({
    model: AI_CONFIG.openai.model,
    messages: [
      {
        role: 'system',
        content: '你是一个专业的教育数据分析师，擅长成绩分析和教学指导。请用中文回答。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 2000,
    temperature: 0.7
  });

  return response.choices[0].message.content;
}

// Claude调用
async function callClaude(prompt) {
  if (!AI_CONFIG.claude.apiKey) {
    throw new Error('Claude API未配置');
  }

  const response = await axios.post(AI_CONFIG.claude.endpoint, {
    model: 'claude-3-sonnet-20240229',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  }, {
    headers: {
      'Authorization': `Bearer ${AI_CONFIG.claude.apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.content[0].text;
}

// 千帆调用
async function callQianfan(prompt) {
  if (!AI_CONFIG.qianfan.apiKey) {
    throw new Error('千帆API未配置');
  }

  const response = await axios.post(AI_CONFIG.qianfan.endpoint, {
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  }, {
    headers: {
      'Authorization': `Bearer ${AI_CONFIG.qianfan.apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.result;
}

// 本地分析（备用方案）
async function performLocalAnalysis(data, prompt) {
  const insights = [];
  
  // 基础统计分析
  const avgScores = Object.entries(data.statistics.bySubject).map(([subject, stats]) => ({
    subject,
    average: stats.average,
    passRate: stats.passRate
  }));
  
  // 找出表现最好和最差的科目
  const bestSubject = avgScores.reduce((best, current) => 
    current.average > best.average ? current : best
  );
  const worstSubject = avgScores.reduce((worst, current) => 
    current.average < worst.average ? current : worst
  );
  
  insights.push(`表现最好的科目是${bestSubject.subject}，平均分${bestSubject.average.toFixed(2)}分`);
  insights.push(`需要重点关注的科目是${worstSubject.subject}，平均分${worstSubject.average.toFixed(2)}分`);
  
  // 及格率分析
  const lowPassRateSubjects = avgScores.filter(s => s.passRate < 60);
  if (lowPassRateSubjects.length > 0) {
    insights.push(`以下科目及格率偏低：${lowPassRateSubjects.map(s => `${s.subject}(${s.passRate.toFixed(1)}%)`).join(', ')}`);
  }
  
  // 班级分析
  const classStats = Object.entries(data.statistics.byClass);
  if (classStats.length > 1) {
    insights.push('建议进行班级间对比分析，找出教学差异');
  }
  
  return `
基于数据分析，得出以下关键发现：

${insights.map((insight, index) => `${index + 1}. ${insight}`).join('\n')}

教学建议：
1. 加强${worstSubject.subject}的教学，分析学生困难点
2. 总结${bestSubject.subject}的教学经验，推广到其他科目
3. 针对不及格学生制定个性化辅导方案
4. 定期进行成绩跟踪和对比分析

改进方案：
1. 建立科目间协调机制
2. 增加课后辅导时间
3. 采用多元化教学方法
4. 加强家校沟通
`;
}

// 生成AI分析建议
async function generateAISuggestions(data) {
  const suggestions = [];
  
  // 基于表格类型的建议
  if (data.tableAnalysis) {
    if (data.tableAnalysis.tableType === 'multi-subject') {
      suggestions.push({
        type: 'analysis',
        title: '多科目分析建议',
        content: '建议进行科目间相关性分析，找出学科之间的关联性'
      });
    }
    
    suggestions.push({
      type: 'visualization',
      title: '可视化建议',
      content: '推荐使用以下图表类型：' + data.chartRecommendations.map(r => r.title).join('、')
    });
  }
  
  // 基于统计结果的建议
  const lowPerformanceSubjects = Object.entries(data.statistics.bySubject)
    .filter(([_, stats]) => stats.average < 70)
    .map(([subject]) => subject);
    
  if (lowPerformanceSubjects.length > 0) {
    suggestions.push({
      type: 'teaching',
      title: '教学改进建议',
      content: `以下科目需要重点关注：${lowPerformanceSubjects.join('、')}`
    });
  }
  
  return {
    suggestions,
    tableAnalysis: data.tableAnalysis,
    chartRecommendations: data.chartRecommendations
  };
}

function prepareDataContext(data) {
  return {
    studentCount: data.students.length,
    subjectCount: data.subjects.length,
    classCount: data.classes.length,
    tableType: data.tableAnalysis?.tableType,
    averageScores: Object.fromEntries(
      Object.entries(data.statistics.bySubject).map(([subject, stats]) => [
        subject, 
        {
          average: stats.average,
          passRate: stats.passRate
        }
      ])
    )
  };
}

// PDF报告生成函数已删除

// 个人分析函数
function generatePersonalAnalysis(data, studentId) {
  const student = data.students.find(s => s.id.toString() === studentId.toString());
  if (!student) return null;

  const grades = student.grades;
  // 过滤掉非成绩字段（如总分）
  const filteredSubjects = Object.keys(grades).filter(subject => {
    const lowerSubject = subject.toLowerCase();
    return !['总分', 'total', '合计', 'sum', '总计'].some(pattern => 
      lowerSubject.includes(pattern.toLowerCase()));
  });
  const subjects = filteredSubjects;
  
  // 计算基本信息
  const totalScore = calculateTotalScore(grades);
  const averageScore = calculateAverageScore(grades);
  
  // 计算排名
  const classRank = calculateClassRanking(data, student);
  const gradeRank = calculateGradeRanking(data, student);
  
  // 获取原始排名数据（如果存在）
  const originalRankings = student.rankings || {};
  
  // 学科达成率分析（以60分为及格线）
  const achievementRates = subjects.map(subject => ({
    subject,
    score: grades[subject],
    isPass: grades[subject] >= 60,
    rate: (grades[subject] / 100) * 100
  }));
  
  // 学科贡献比分析
  const contributionRates = subjects.map(subject => ({
    subject,
    contribution: (grades[subject] / totalScore) * 100
  }));
  
  // 偏科分析（相对于个人平均分）
  const subjectDeviations = subjects.map(subject => ({
    subject,
    score: grades[subject],
    deviation: grades[subject] - averageScore,
    percentage: ((grades[subject] - averageScore) / averageScore) * 100
  }));
  
  // 成绩等级划分
  const scoreGrades = subjects.map(subject => {
    const score = grades[subject];
    let level = 'poor';
    if (score >= 90) level = 'excellent';
    else if (score >= 80) level = 'good';
    else if (score >= 70) level = 'average';
    
    return {
      subject,
      score,
      level,
      classAverage: data.statistics.bySubject[subject]?.average || 0,
      difference: score - (data.statistics.bySubject[subject]?.average || 0)
    };
  });

  return {
    student: {
      id: student.id,
      name: student.name,
      class: student.class,
      totalScore,
      averageScore,
      classRank,
      gradeRank,
      originalRankings
    },
    analysis: {
      achievementRates,
      contributionRates,
      subjectDeviations,
      scoreGrades,
      subjects
    },
    charts: {
      achievement: {
        labels: achievementRates.map(a => a.subject),
        passed: achievementRates.filter(a => a.isPass).length,
        failed: achievementRates.filter(a => !a.isPass).length
      },
      contribution: {
        labels: contributionRates.map(c => c.subject),
        data: contributionRates.map(c => c.contribution)
      },
      radar: {
        labels: subjects,
        studentData: subjects.map(subject => grades[subject]),
        classAverageData: subjects.map(subject => data.statistics.bySubject[subject]?.average || 0)
      },
      scores: {
        labels: subjects,
        data: subjects.map(subject => grades[subject])
      }
    }
  };
}

// 班级分析函数
function generateClassAnalysis(data, className) {
  const classStudents = data.students.filter(s => s.class === className);
  if (classStudents.length === 0) return null;

  const subjects = data.subjects;
  
  // 班级基本统计
  const classStats = {
    name: className,
    studentCount: classStudents.length,
    averageScore: calculateClassAverageScore(classStudents, subjects),
    passRate: calculateClassPassRate(classStudents, subjects),
    ranking: calculateClassRankingPosition(data, className)
  };
  
  // 班级各科统计
  const subjectStats = subjects.map(subject => {
    const scores = classStudents
      .map(s => s.grades[subject])
      .filter(score => score !== undefined);
    
    if (scores.length === 0) return null;
    
    return {
      subject,
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      max: Math.max(...scores),
      min: Math.min(...scores),
      passRate: scores.filter(score => score >= 60).length / scores.length * 100,
      studentCount: scores.length
    };
  }).filter(stat => stat !== null);
  
  // 学生排名
  const studentRankings = classStudents
    .map(student => ({
      id: student.id,
      name: student.name,
      totalScore: calculateTotalScore(student.grades),
      averageScore: calculateAverageScore(student.grades)
    }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((student, index) => ({
      ...student,
      rank: index + 1
    }));
  
  // 分科排名
  const subjectRankings = {};
  subjects.forEach(subject => {
    const rankings = classStudents
      .filter(s => s.grades[subject] !== undefined)
      .map(student => ({
        id: student.id,
        name: student.name,
        score: student.grades[subject]
      }))
      .sort((a, b) => b.score - a.score)
      .map((student, index) => ({
        ...student,
        rank: index + 1
      }));
    
    subjectRankings[subject] = rankings;
  });
  
  // 成绩分布
  const scoreDistribution = calculateScoreDistribution(classStudents, subjects);
  
  // 箱型图数据
  const boxPlotData = calculateBoxPlotData(classStudents, subjects);
  
  // 班级对比数据
  const classComparison = generateClassComparison(data, className);

  return {
    classInfo: classStats,
    subjectStats,
    studentRankings,
    subjectRankings,
    scoreDistribution,
    boxPlotData,
    classComparison,
    charts: {
      subjectAverage: {
        labels: subjectStats.map(s => s.subject),
        averages: subjectStats.map(s => s.average),
        passRates: subjectStats.map(s => s.passRate)
      },
      ranking: {
        labels: studentRankings.slice(0, 10).map(s => s.name),
        data: studentRankings.slice(0, 10).map(s => s.totalScore)
      },
      distribution: scoreDistribution,
      boxPlot: boxPlotData
    }
  };
}

// 辅助计算函数
function calculateTotalScore(grades) {
  // 排除总分字段（如果表格中已包含）
  const filteredGrades = {};
  Object.entries(grades).forEach(([subject, score]) => {
    const lowerSubject = subject.toLowerCase();
    if (!['总分', 'total', '合计', 'sum', '总计'].some(pattern => 
        lowerSubject.includes(pattern.toLowerCase()))) {
      filteredGrades[subject] = score;
    }
  });
  
  const scores = Object.values(filteredGrades);
  return scores.reduce((sum, score) => sum + score, 0);
}

function calculateAverageScore(grades) {
  // 排除总分字段（如果表格中已包含）
  const filteredGrades = {};
  Object.entries(grades).forEach(([subject, score]) => {
    const lowerSubject = subject.toLowerCase();
    if (!['总分', 'total', '合计', 'sum', '总计'].some(pattern => 
        lowerSubject.includes(pattern.toLowerCase()))) {
      filteredGrades[subject] = score;
    }
  });
  
  const scores = Object.values(filteredGrades);
  return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
}

function calculateClassRanking(data, student) {
  const studentAverage = calculateAverageScore(student.grades);
  const classStudents = data.students.filter(s => s.class === student.class);
  
  const rank = classStudents
    .map(s => calculateAverageScore(s.grades))
    .filter(avg => avg > studentAverage).length + 1;
  
  return `${rank}/${classStudents.length}`;
}

function calculateGradeRanking(data, student) {
  const studentAverage = calculateAverageScore(student.grades);
  
  const rank = data.students
    .map(s => calculateAverageScore(s.grades))
    .filter(avg => avg > studentAverage).length + 1;
  
  return `${rank}/${data.students.length}`;
}

function calculateClassAverageScore(classStudents, subjects) {
  const allScores = [];
  classStudents.forEach(student => {
    subjects.forEach(subject => {
      if (student.grades[subject] !== undefined) {
        allScores.push(student.grades[subject]);
      }
    });
  });
  
  return allScores.length > 0 ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length : 0;
}

function calculateClassPassRate(classStudents, subjects) {
  const allScores = [];
  classStudents.forEach(student => {
    subjects.forEach(subject => {
      if (student.grades[subject] !== undefined) {
        allScores.push(student.grades[subject]);
      }
    });
  });
  
  const passedCount = allScores.filter(score => score >= 60).length;
  return allScores.length > 0 ? (passedCount / allScores.length) * 100 : 0;
}

function calculateClassRankingPosition(data, className) {
  const classAverages = data.classes.map(cls => {
    const classStudents = data.students.filter(s => s.class === cls);
    return {
      class: cls,
      average: calculateClassAverageScore(classStudents, data.subjects)
    };
  }).sort((a, b) => b.average - a.average);
  
  const position = classAverages.findIndex(cls => cls.class === className) + 1;
  return `${position}/${data.classes.length}`;
}

function calculateScoreDistribution(classStudents, subjects) {
  // 计算总分分布，创建更细致的分数段
  const ranges = [
    { name: '580-600', min: 580, max: 600, count: 0 },
    { name: '560-579', min: 560, max: 579, count: 0 },
    { name: '540-559', min: 540, max: 559, count: 0 },
    { name: '520-539', min: 520, max: 539, count: 0 },
    { name: '500-519', min: 500, max: 519, count: 0 },
    { name: '480-499', min: 480, max: 499, count: 0 },
    { name: '460-479', min: 460, max: 479, count: 0 },
    { name: '440-459', min: 440, max: 459, count: 0 },
    { name: '420-439', min: 420, max: 439, count: 0 },
    { name: '400-419', min: 400, max: 419, count: 0 },
    { name: '380-399', min: 380, max: 399, count: 0 },
    { name: '360-379', min: 360, max: 379, count: 0 },
    { name: '<360', min: 0, max: 359, count: 0 }
  ];
  
  // 计算每个学生的总分分布
  classStudents.forEach(student => {
    const totalScore = calculateTotalScore(student.grades);
    const range = ranges.find(r => totalScore >= r.min && totalScore <= r.max);
    if (range) range.count++;
  });
  
  // 过滤掉人数为0的分数段，让图表更清晰
  return ranges.filter(range => range.count > 0);
}

function calculateBoxPlotData(classStudents, subjects) {
  return subjects.map(subject => {
    const scores = classStudents
      .map(s => s.grades[subject])
      .filter(score => score !== undefined)
      .sort((a, b) => a - b);
    
    if (scores.length === 0) return null;
    
    // 计算箱型图的关键统计量
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const median = calculatePercentile(scores, 50);
    const q1 = calculatePercentile(scores, 25);
    const q3 = calculatePercentile(scores, 75);
    const iqr = q3 - q1;
    
    // 计算异常值边界
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    
    // 找出异常值
    const outliers = scores.filter(score => score < lowerFence || score > upperFence);
    
    // 计算须线端点（排除异常值后的最值）
    const whiskerLow = Math.max(min, lowerFence);
    const whiskerHigh = Math.min(max, upperFence);
    
    return {
      subject,
      min: whiskerLow,
      q1,
      median,
      q3,
      max: whiskerHigh,
      outliers,
      mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      count: scores.length,
      std: calculateStandardDeviation(scores)
    };
  }).filter(data => data !== null);
}

function calculatePercentile(sortedArray, percentile) {
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

function calculateStandardDeviation(array) {
  const mean = array.reduce((sum, val) => sum + val, 0) / array.length;
  const variance = array.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / array.length;
  return Math.sqrt(variance);
}

// 清理科目名称
function cleanSubjectName_func(subjectName) {
  if (typeof subjectName !== 'string') return subjectName;
  
  // 提取核心科目名称
  const subjectMappings = {
    '语文': ['语文', 'chinese'],
    '数学': ['数学', 'math', 'mathematics'],
    '英语': ['英语', 'english'],
    '物理': ['物理', 'physics'],
    '化学': ['化学', 'chemistry'],
    '生物': ['生物', 'biology'],
    '历史': ['历史', 'history'],
    '地理': ['地理', 'geography'],
    '政治': ['政治', 'politics'],
    '总分': ['总分', 'total']
  };
  
  const lowerSubject = subjectName.toLowerCase();
  
  // 查找匹配的科目
  for (const [cleanName, patterns] of Object.entries(subjectMappings)) {
    if (patterns.some(pattern => lowerSubject.includes(pattern.toLowerCase()))) {
      return cleanName;
    }
  }
  
  // 如果没有匹配，尝试提取中文部分
  const chineseMatch = subjectName.match(/[\u4e00-\u9fa5]+/);
  if (chineseMatch) {
    return chineseMatch[0];
  }
  
  return subjectName;
}

function generateClassComparison(data, targetClassName) {
  const classComparison = data.classes.map(className => {
    const classStudents = data.students.filter(s => s.class === className);
    return {
      class: className,
      average: calculateClassAverageScore(classStudents, data.subjects),
      passRate: calculateClassPassRate(classStudents, data.subjects),
      studentCount: classStudents.length,
      isTarget: className === targetClassName
    };
  }).sort((a, b) => b.average - a.average);
  
  // 如果只有一个班级，添加参考数据以便比较
  if (classComparison.length === 1) {
    const targetClass = classComparison[0];
    const allStudents = data.students;
    const gradeAverage = calculateClassAverageScore(allStudents, data.subjects);
    const gradePassRate = calculateClassPassRate(allStudents, data.subjects);
    
    // 添加年级平均水平作为参考
    classComparison.push({
      class: '年级平均',
      average: gradeAverage,
      passRate: gradePassRate,
      studentCount: allStudents.length,
      isTarget: false,
      isReference: true
    });
  }
  
  return classComparison;
}

// 个人PDF报告生成函数已删除

// 服务端图表生成已删除 - 使用客户端图表

// 所有服务端图表生成函数已简化 - 使用客户端图表
async function generateSubjectAverageChart(data, chartCanvas) {
  return null;
}

async function generateScoreDistributionChart(data, chartCanvas) {
  return null;
}

async function generateClassComparisonChart(data, chartCanvas) {
  return null;
}

async function generatePersonalRadarChart(student, data, chartCanvas) {
  return null;
}

async function generatePersonalSubjectChart(student, data, chartCanvas) {
  return null;
}

async function generatePersonalRankingChart(student, data, chartCanvas) {
  return null;
}

// 启动服务器
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 成绩分析系统启动成功！`);
    console.log(`📊 访问地址: http://localhost:${PORT}`);
    console.log(`📄 现在支持数据导出和图表保存功能！`);
    console.log(`💡 请在浏览器中打开上述地址查看应用界面`);
    
    // 检查public目录是否存在
    const publicPath = path.join(__dirname, 'public');
    if (!fs.existsSync(publicPath)) {
      console.error(`❌ 错误: public 目录不存在于 ${publicPath}`);
    } else {
      const indexPath = path.join(publicPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
        console.error(`❌ 错误: index.html 不存在于 ${indexPath}`);
      } else {
        console.log(`✅ 静态文件配置正确`);
      }
    }
  });
}

// 导出app供Vercel使用
module.exports = app;
