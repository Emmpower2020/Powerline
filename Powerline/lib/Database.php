<?php
/**
 * Database.php — کلاس اتصال به دیتابیس (Singleton PDO)
 *
 * روش استفاده:
 *   $db = Database::getInstance();
 *   $pdo = $db->getConnection();
 *   $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
 *   $stmt->execute([$id]);
 *   $user = $stmt->fetch();
 */

class Database
{
    private static $instance = null;
    private $pdo = null;

    /**
     * دریافت نمونه singleton
     */
    public static function getInstance(): Database
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * سازنده خصوصی
     */
    private function __construct()
    {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,  // برای پشتیبانی واقعی از prepared statements
            PDO::ATTR_PERSISTENT => false,
        ];

        try {
            $this->pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            Logger::log('ERROR', "Database connection failed: " . $e->getMessage());
            Response::error(500, 'Database connection failed');
        }
    }

    /**
     * دریافت اتصال PDO
     */
    public function getConnection(): PDO
    {
        return $this->pdo;
    }

    /**
     * اجرای کوئری SELECT و برگرداندن همه ردیف‌ها
     */
    public function fetchAll(string $sql, array $params = []): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * اجرای کوئری SELECT و برگرداندن یک ردیف
     */
    public function fetchOne(string $sql, array $params = []): ?array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * اجرای کوئری INSERT/UPDATE/DELETE و برگرداندن تعداد ردیف‌های تحت تاثیر
     */
    public function execute(string $sql, array $params = []): int
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /**
     * درج رکورد و برگرداندن ID جدید
     */
    public function insert(string $table, array $data): int
    {
        $columns = array_keys($data);
        $placeholders = array_map(fn($c) => ":$c", $columns);

        $sql = "INSERT INTO `$table` (" . implode(', ', array_map(fn($c) => "`$c`", $columns)) . ") "
             . "VALUES (" . implode(', ', $placeholders) . ")";

        $stmt = $this->pdo->prepare($sql);

        // bind params با نوع داده مناسب
        foreach ($data as $key => $value) {
            $paramType = PDO::PARAM_STR;
            if (is_int($value)) $paramType = PDO::PARAM_INT;
            elseif (is_bool($value)) $paramType = PDO::PARAM_BOOL;
            elseif (is_null($value)) $paramType = PDO::PARAM_NULL;
            $stmt->bindValue(":$key", $value, $paramType);
        }

        $stmt->execute();
        return (int) $this->pdo->lastInsertId();
    }

    /**
     * به‌روزرسانی رکورد
     *
     * نکته: همه پارامترها به‌صورت positional (?) استفاده می‌شن تا با whereParams سازگار باشن.
     */
    public function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        $setParts = [];
        $setValues = [];
        foreach ($data as $column => $value) {
            $setParts[] = "`$column` = ?";
            $setValues[] = $value;
        }

        $sql = "UPDATE `$table` SET " . implode(', ', $setParts) . " WHERE $where";

        $stmt = $this->pdo->prepare($sql);

        // ترکیب set values و where params در یک آرایه (به ترتیب)
        $allParams = array_merge($setValues, $whereParams);

        foreach ($allParams as $i => $value) {
            $paramType = PDO::PARAM_STR;
            if (is_int($value)) $paramType = PDO::PARAM_INT;
            elseif (is_bool($value)) $paramType = PDO::PARAM_BOOL;
            elseif (is_null($value)) $paramType = PDO::PARAM_NULL;
            $stmt->bindValue($i + 1, $value, $paramType);
        }

        $stmt->execute();
        return $stmt->rowCount();
    }

    /**
     * حذف رکورد (soft delete: is_active = 0)
     */
    public function softDelete(string $table, string $where, array $params = []): int
    {
        $sql = "UPDATE `$table` SET `is_active` = 0 WHERE $where";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /**
     * شروع تراکنش
     */
    public function beginTransaction(): void
    {
        $this->pdo->beginTransaction();
    }

    /**
     * تأیید تراکنش
     */
    public function commit(): void
    {
        $this->pdo->commit();
    }

    /**
     * برگرداندن تراکنش
     */
    public function rollBack(): void
    {
        if ($this->pdo->inTransaction()) {
            $this->pdo->rollBack();
        }
    }

    /**
     * شمارش ردیف‌ها
     *
     * نکته: $table می‌تواند شامل alias باشد (مثل "lines l" یا "towers t")
     * در این صورت فقط نام اصلی در backtick قرار می‌گیرد.
     */
    public function count(string $table, string $where = '1=1', array $params = []): int
    {
        // اگر شامل فاصله است (یعنی alias دارد)، فقط نام اصلی را در backtick قرار بده
        if (strpos($table, ' ') !== false) {
            $parts = explode(' ', $table, 2);
            $tableName = $parts[0];
            $alias = $parts[1];
            $tableClause = "`$tableName` $alias";
        } else {
            $tableClause = "`$table`";
        }

        $sql = "SELECT COUNT(*) FROM $tableClause WHERE $where";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /**
     * بررسی وجود رکورد
     */
    public function exists(string $table, string $where, array $params = []): bool
    {
        return $this->count($table, $where, $params) > 0;
    }

    /**
     * دریافت ID آخرین رکورد درج‌شده
     */
    public function lastInsertId(): string
    {
        return $this->pdo->lastInsertId();
    }
}
